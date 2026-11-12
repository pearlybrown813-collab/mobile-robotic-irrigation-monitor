/*
  ===========================================================================
  Mobile Robotic Irrigation Monitoring System - robot firmware
  Board : ESP32 DevKit v1 (Arduino core for ESP32)
  Libraries (Arduino Library Manager): ESP32Servo, OneWire, DallasTemperature
  ---------------------------------------------------------------------------
  Main loop (Figure 3.7 / Section 4.3):
    1. Poll the server for the next command chosen on the dashboard.
    2. GOTO n  -> drive to sampling point n, lower the probe, take 8 ADC
                  samples, read the DS18B20, raise the probe.
    3. Send the reading (HTTP POST /api/readings with X-Device-Key).
    4. If Wi-Fi or the server is unavailable, keep the reading in a local
       buffer and resend it automatically when the connection returns.
    5. If Wi-Fi never comes up, fall back to visiting every point in turn.
  ===========================================================================
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------- Pin map (Figure 4.2 and Table 4.1) ----------
const int PIN_MOISTURE_AOUT = 34;  // ADC1 channel, input-only pin
const int PIN_TEMP_DATA     = 4;   // DS18B20 data (4.7 kOhm pull-up to 3V3)
const int PIN_SERVO         = 13;  // probe insert / retract servo
const int PIN_IN1 = 25, PIN_IN2 = 26, PIN_IN3 = 27, PIN_IN4 = 14;  // L298N direction
const int PIN_ENA = 32, PIN_ENB = 33;                               // L298N speed (PWM)
const int PIN_BATTERY = 35;        // battery voltage through a 100k/33k divider

// ---------- Network / server ----------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// Address of the computer running the Express server (port 4000).
const char* SERVER_BASE   = "http://192.168.1.100:4000";
const char* DEVICE_KEY    = "robot-01-demo-key";   // must match the server's DEVICE_KEY
const int   WIFI_CONNECT_TIMEOUT_MS = 8000;
const int   WIFI_MAX_RETRIES        = 3;
const unsigned long POLL_INTERVAL_MS = 3000;

// ---------- Calibration and thresholds (updated from the server) ----------
int   adcDryRaw = 3000;          // sensor in dry air
int   adcWetRaw = 1200;          // sensor tip in water
float dryBelowPct = 30.0;        // below this  -> "dry"
float wetAbovePct = 60.0;        // above this  -> "wet"

const int SAMPLES_PER_READING = 8;
const int SAMPLE_DELAY_MS     = 120;
const int SERVO_UP_DEG = 0, SERVO_DOWN_DEG = 90;
const int DRIVE_PWM = 180;
const unsigned long MS_PER_SEGMENT = 1500;  // drive time between neighbouring points (calibrate on the plot)
const int TOTAL_SAMPLING_POINTS = 5;

// ---------- Local buffer for offline readings ----------
struct Reading {
  int   pointIndex;
  float moisturePct;
  float temperatureC;
  int   raw;
};
const int MAX_BUFFERED_READINGS = 20;
Reading buffer[MAX_BUFFERED_READINGS];
int bufferCount = 0;

OneWire oneWire(PIN_TEMP_DATA);
DallasTemperature tempSensor(&oneWire);
Servo probeServo;

int currentPoint = 0;            // 0 = start line
bool offlineMode = false;
unsigned long lastPoll = 0;

// ===========================================================================
void setup() {
  Serial.begin(115200);
  pinMode(PIN_IN1, OUTPUT); pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IN3, OUTPUT); pinMode(PIN_IN4, OUTPUT);
  pinMode(PIN_ENA, OUTPUT); pinMode(PIN_ENB, OUTPUT);
  stopMotors();
  analogReadResolution(12);
  probeServo.attach(PIN_SERVO);
  probeServo.write(SERVO_UP_DEG);     // probe raised for travel
  tempSensor.begin();
  offlineMode = !connectWiFi();
  sendHeartbeat("idle");
}

void loop() {
  if (offlineMode) {                  // no Wi-Fi at start-up: visit every point in turn
    runOfflineSweep();
    offlineMode = !connectWiFi();
    return;
  }
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (millis() - lastPoll < POLL_INTERVAL_MS) return;
  lastPoll = millis();

  String body;
  if (!httpGet("/api/robot/next-command", body)) { flushBufferIfPossible(); return; }
  updateThresholds(body);
  String command = jsonString(body, "command");
  int commandId  = jsonInt(body, "commandId", -1);

  if (command == "GOTO") {
    int target = jsonInt(body, "targetPoint", -1);
    if (target >= 1) {
      visitPoint(target);
      httpPost(String("/api/robot/commands/") + commandId + "/done", "");
    }
  } else if (command == "STOP") {
    stopMotors();
    httpPost(String("/api/robot/commands/") + commandId + "/done", "");
  } else if (command == "RETURN") {
    driveSegments(-currentPoint);
    currentPoint = 0;
    httpPost(String("/api/robot/commands/") + commandId + "/done", "");
  } else {
    sendHeartbeat("idle");
  }
  flushBufferIfPossible();
}

// ---------------------------------------------------------------------------
void visitPoint(int target) {
  Serial.printf("Moving from point %d to point %d...\n", currentPoint, target);
  sendHeartbeat("moving");
  driveSegments(target - currentPoint);
  currentPoint = target;
  sendHeartbeat("sampling");
  Reading r = insertProbeAndSample();
  r.pointIndex = currentPoint;
  Serial.println("Status: " + classify(r.moisturePct));
  if (!(WiFi.status() == WL_CONNECTED && transmitReading(r, false))) bufferReadingLocally(r);
  sendHeartbeat("idle");
}

void runOfflineSweep() {
  Serial.println("Offline mode: sampling every point in turn; readings are buffered.");
  for (int p = 1; p <= TOTAL_SAMPLING_POINTS; p++) visitPoint(p);
  driveSegments(-currentPoint);
  currentPoint = 0;
}

// ---------------------------------------------------------------------------
bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  for (int attempt = 1; attempt <= WIFI_MAX_RETRIES; attempt++) {
    Serial.printf("Wi-Fi connect attempt %d...\n", attempt);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) delay(250);
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("Wi-Fi connected, IP: ");
      Serial.println(WiFi.localIP());
      return true;
    }
  }
  Serial.println("Wi-Fi unavailable after retries. Readings will be buffered.");
  return false;
}

// ---------------------------------------------------------------------------
void driveSegments(int segments) {
  if (segments == 0) return;
  bool forward = segments > 0;
  digitalWrite(PIN_IN1, forward ? HIGH : LOW); digitalWrite(PIN_IN2, forward ? LOW : HIGH);
  digitalWrite(PIN_IN3, forward ? HIGH : LOW); digitalWrite(PIN_IN4, forward ? LOW : HIGH);
  analogWrite(PIN_ENA, DRIVE_PWM);
  analogWrite(PIN_ENB, DRIVE_PWM);
  delay(MS_PER_SEGMENT * (unsigned long)abs(segments));
  stopMotors();
}

void stopMotors() {
  digitalWrite(PIN_IN1, LOW); digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW); digitalWrite(PIN_IN4, LOW);
  analogWrite(PIN_ENA, 0);
  analogWrite(PIN_ENB, 0);
}

// ---------------------------------------------------------------------------
Reading insertProbeAndSample() {
  probeServo.write(SERVO_DOWN_DEG);   // lower probe into the soil
  delay(600);                         // let the reading settle
  long sumRaw = 0;
  for (int i = 0; i < SAMPLES_PER_READING; i++) {
    sumRaw += analogRead(PIN_MOISTURE_AOUT);
    delay(SAMPLE_DELAY_MS);
  }
  int avgRaw = sumRaw / SAMPLES_PER_READING;
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);   // -127 means sensor not found
  probeServo.write(SERVO_UP_DEG);     // raise probe before moving on
  delay(400);

  Reading r;
  r.raw = avgRaw;
  r.moisturePct = rawToMoisturePercent(avgRaw);
  r.temperatureC = tempC;
  Serial.printf("Point %d -> raw=%d moisture=%.1f%% temp=%.1fC\n", currentPoint, avgRaw, r.moisturePct, tempC);
  return r;
}

float rawToMoisturePercent(int raw) {
  float pct = (float)(adcDryRaw - raw) / (float)(adcDryRaw - adcWetRaw) * 100.0;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

String classify(float moisturePct) {
  if (moisturePct < dryBelowPct) return "dry";
  if (moisturePct > wetAbovePct) return "wet";
  return "normal";
}

float readBatteryVolts() {
  // 100k/33k divider: Vbat = Vadc * (133/33)
  return analogReadMilliVolts(PIN_BATTERY) / 1000.0 * (133.0 / 33.0);
}

// ---------------------------------------------------------------------------
bool transmitReading(const Reading& r, bool wasBuffered) {
  String body = "point=" + String(r.pointIndex)
              + "&moisture=" + String(r.moisturePct, 1)
              + "&temperature=" + String(r.temperatureC, 1)
              + "&raw=" + String(r.raw)
              + "&buffered=" + String(wasBuffered ? 1 : 0);
  int code = httpPost("/api/readings", body);
  if (code == 200) { Serial.println("Reading transmitted successfully."); return true; }
  if (code == 400) { Serial.println("Server rejected the reading (sensor fault?). Dropped."); return true; }
  Serial.printf("Transmit failed, HTTP code %d. Will buffer.\n", code);
  return false;
}

void bufferReadingLocally(const Reading& r) {
  if (bufferCount < MAX_BUFFERED_READINGS) {
    buffer[bufferCount++] = r;
  } else {
    Serial.println("Buffer full; oldest reading discarded.");
    for (int i = 1; i < MAX_BUFFERED_READINGS; i++) buffer[i - 1] = buffer[i];
    buffer[MAX_BUFFERED_READINGS - 1] = r;
  }
  Serial.printf("Reading buffered locally (%d in queue).\n", bufferCount);
}

void flushBufferIfPossible() {
  if (WiFi.status() != WL_CONNECTED || bufferCount == 0) return;
  int remaining = 0;
  for (int i = 0; i < bufferCount; i++) {
    if (!transmitReading(buffer[i], true)) buffer[remaining++] = buffer[i];  // keep failures
  }
  bufferCount = remaining;
}

void sendHeartbeat(const char* state) {
  if (WiFi.status() != WL_CONNECTED) return;
  String body = String("state=") + state + "&point=" + currentPoint + "&battery=" + String(readBatteryVolts(), 2);
  httpPost("/api/robot/heartbeat", body);
}

// ---------------------------------------------------------------------------
int httpPost(const String& path, const String& body) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  HTTPClient http;
  http.begin(String(SERVER_BASE) + path);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.POST(body);
  http.end();
  return code;
}

bool httpGet(const String& path, String& out) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.begin(String(SERVER_BASE) + path);
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.GET();
  if (code == 200) out = http.getString();
  http.end();
  return code == 200;
}

// Tiny JSON helpers (enough for the server's flat replies; no extra library).
String jsonString(const String& json, const char* key) {
  String pattern = String("\"") + key + "\":\"";
  int start = json.indexOf(pattern);
  if (start < 0) return "";
  start += pattern.length();
  return json.substring(start, json.indexOf('"', start));
}

float jsonNumber(const String& json, const char* key, float fallback) {
  String pattern = String("\"") + key + "\":";
  int start = json.indexOf(pattern);
  if (start < 0) return fallback;
  start += pattern.length();
  int end = start;
  while (end < (int)json.length() && (isDigit(json[end]) || json[end] == '.' || json[end] == '-')) end++;
  return end > start ? json.substring(start, end).toFloat() : fallback;
}

int jsonInt(const String& json, const char* key, int fallback) {
  return (int)jsonNumber(json, key, fallback);
}

void updateThresholds(const String& json) {
  dryBelowPct = jsonNumber(json, "dryBelow", dryBelowPct);
  wetAbovePct = jsonNumber(json, "wetAbove", wetAbovePct);
  adcDryRaw   = jsonInt(json, "adcDryRaw", adcDryRaw);
  adcWetRaw   = jsonInt(json, "adcWetRaw", adcWetRaw);
}
