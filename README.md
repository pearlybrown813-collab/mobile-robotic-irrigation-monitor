# Mobile Robotic Irrigation Monitoring System

Software for the project **"Mobile Robotic Irrigation Monitoring System Using Soil Moisture and Ambient Temperature Sensors"** (Otiono Awele Lawritta, 2026).

A small wheeled robot built on an ESP32 drives to each sampling point on a farm plot. At each point it lowers a capacitive soil-moisture probe, reads a DS18B20 temperature sensor and sends the reading over Wi-Fi to a Node.js/Express server. The server stores the reading in MySQL. A React dashboard then shows the reading with an irrigation recommendation: **Irrigation needed**, **Condition satisfactory** or **No irrigation required**.

| Part | Folder | Technology |
|---|---|---|
| Robot firmware | `firmware/irrigation_robot/` | Arduino C/C++ on ESP32 |
| API server | `server/` | Node.js 20, Express, TypeScript |
| Dashboard | `client/` | React 18, TypeScript, Vite |
| Database | `database/` | MySQL 8 |
| Robot simulator | `server/scripts/robot-simulator.ts` | TypeScript (stands in for the robot when there is no hardware) |

---

## 1. Run it in GitHub Codespaces (no installation on your computer)

1. Upload this folder to a new GitHub repository. The steps are in section 5 below.
2. On the repository page, click the green **Code** button. Open the **Codespaces** tab and click **Create codespace on main**.
3. Wait 3–5 minutes the first time. The codespace sets up three things for you:
   - a Node.js 20 workspace and a MySQL 8 database (from `.devcontainer/`);
   - all packages (`npm run setup`);
   - the tables, sample sampling points and the first accounts (`npm run db:init`).
4. When the terminal shows `Database ready.`, start the system:
   ```bash
   npm run dev
   ```
5. A browser tab opens on port **5173**. If it does not, open the **Ports** tab and click the globe icon beside 5173.
6. Log in with one of these accounts:
   - **admin / Admin@123** – administrator: manages sampling points, thresholds and users
   - **farmer / Farmer@123** – field user: views readings and directs the robot

   Change both passwords under **Settings** after you log in.
7. With no robot hardware connected, open a **second terminal** (click **+** in the terminal panel) and start the robot simulator:
   ```bash
   npm run simulate
   ```
   On the dashboard, pick a sampling point under **Send robot to** and click **Go**. The simulator drives there, takes the reading and sends it, and the dashboard updates within 5 seconds.
   If you want the robot to sample every point in turn without commands, run `npm run simulate:auto` instead.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API (port 4000) and the dashboard (port 5173) together |
| `npm run simulate` | Starts the software robot (operator-directed mode) |
| `npm run simulate:auto` | Starts the software robot (visits every point in turn) |
| `npm test` | Runs the unit tests (decision rules, validation, security) |
| `npm run db:init` | Re-creates any missing tables and accounts. Existing data is kept. |
| `npm run build && npm start` | Builds the dashboard and serves everything from port 4000 (production mode) |

---

## 2. Run it on your own computer (Windows, macOS or Linux)

1. Install **Node.js 20 LTS** and **MySQL 8**.
2. In MySQL, create the database and a user:
   ```sql
   CREATE DATABASE irrigation_monitor;
   CREATE USER 'irrigation'@'localhost' IDENTIFIED BY 'irrigation_pass';
   GRANT ALL PRIVILEGES ON irrigation_monitor.* TO 'irrigation'@'localhost';
   ```
3. Copy `.env.example` to `server/.env` and edit the values if needed.
4. In the project folder, run:
   ```bash
   npm run setup
   npm run db:init
   npm run dev
   ```
5. Open http://localhost:5173.

---

## 3. Connect the real robot (ESP32)

1. In the Arduino IDE, install the **esp32** board package, then install these libraries: **ESP32Servo**, **OneWire** and **DallasTemperature**.
2. Open `firmware/irrigation_robot/irrigation_robot.ino` and set:
   - `WIFI_SSID` and `WIFI_PASSWORD`;
   - `SERVER_BASE`: the IP address of the computer running the server, followed by `:4000` (for example `http://192.168.1.100:4000`);
   - `DEVICE_KEY`: the same value as `DEVICE_KEY` in the server settings.
3. Select **ESP32 Dev Module** and upload the sketch.
4. Calibrate the moisture sensor: read the raw ADC value in dry air, then with the tip in water. Enter both values in the `thresholds` table (`adc_dry_raw` and `adc_wet_raw`). The robot downloads them each time it polls the server.

Wiring (Table 4.1 of the report):

| ESP32 pin | Connects to |
|---|---|
| GPIO34 | Soil-moisture sensor AOUT |
| GPIO4 | DS18B20 data (4.7 kΩ pull-up to 3.3 V) |
| GPIO13 | Probe servo signal |
| GPIO25, 26, 27, 14 | L298N IN1–IN4 |
| GPIO32, 33 | L298N ENA, ENB |
| GPIO35 | Battery voltage divider (100 k / 33 k) |

**Codespaces note:** a codespace runs in the cloud, so the physical robot on your local Wi-Fi cannot reach it. Use the simulator in Codespaces. To test the real robot, run the server on a computer on the same Wi-Fi network (section 2).

---

## 4. API summary

| Method and path | Used by | Purpose |
|---|---|---|
| `POST /api/auth/login` | Dashboard | Log in and receive a session token |
| `GET /api/readings` | Dashboard | Recent readings (history and chart) |
| `GET /api/readings/latest-by-point` | Dashboard | Newest reading at every point |
| `GET /api/readings/export.csv` | Dashboard | Download all readings |
| `POST /api/robot/commands` | Dashboard | Send the robot to a point (`GOTO`), `STOP` or `RETURN` |
| `GET /api/robot/status` | Dashboard | Robot state, battery and pending command |
| `GET/POST/PUT/DELETE /api/points` | Dashboard | Sampling points (changes: administrator only) |
| `GET/PUT /api/thresholds` | Dashboard | Decision thresholds (changes: administrator only) |
| `GET/POST /api/users`, `GET /api/audit` | Dashboard | User accounts and audit log (administrator only) |
| `GET /api/robot/next-command` | Robot | Collect the next command and the current thresholds |
| `POST /api/readings` | Robot | Send one reading (`X-Device-Key` header) |
| `POST /api/robot/heartbeat` | Robot | Report state, point and battery voltage |

---

## 5. Put the project on GitHub

1. Go to https://github.com/new, create an empty repository (for example `mobile-robotic-irrigation-monitor`), and do not add a README.
2. Choose one of these ways to upload:
   - **On the website:** click **uploading an existing file**, then drag in everything inside this folder, including the `.devcontainer` folder, and commit. If your file browser hides `.devcontainer`, use the terminal method instead.
   - **In a terminal:**
     ```bash
     git init
     git add .
     git commit -m "Mobile robotic irrigation monitoring system"
     git branch -M main
     git remote add origin https://github.com/<your-username>/mobile-robotic-irrigation-monitor.git
     git push -u origin main
     ```
3. Open the codespace as described in section 1.
