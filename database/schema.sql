-- =====================================================================
-- Mobile Robotic Irrigation Monitoring System
-- Database schema (MySQL 8)  --  see Section 3.5 of the project report
-- =====================================================================

CREATE DATABASE IF NOT EXISTS irrigation_monitor
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE irrigation_monitor;

-- ---------------------------------------------------------------------
-- 1. users : people who log in to the web dashboard
--    role 'admin'  = system administrator (manages points, thresholds, users)
--    role 'farmer' = field user (views readings, directs the robot)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  username       VARCHAR(50)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,          -- scrypt hash, never plain text
  role           ENUM('admin','farmer') NOT NULL DEFAULT 'farmer',
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 2. devices : each mobile robot (ESP32) allowed to send readings
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  device_id      INT AUTO_INCREMENT PRIMARY KEY,
  device_name    VARCHAR(60)  NOT NULL UNIQUE,
  api_key_hash   CHAR(64)     NOT NULL,           -- SHA-256 of the device key
  last_seen      DATETIME NULL,
  last_point     INT NULL,
  robot_state    ENUM('idle','moving','sampling','offline') NOT NULL DEFAULT 'offline',
  battery_v      DECIMAL(4,2) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 3. sampling_points : the fixed points on the test plot the robot visits
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sampling_points (
  point_index    INT PRIMARY KEY,                 -- 1, 2, 3 ...
  label          VARCHAR(60)  NOT NULL,           -- e.g. "Bed A - North"
  distance_m     DECIMAL(5,2) NOT NULL DEFAULT 0, -- distance from start line
  crop           VARCHAR(60)  NULL,
  notes          VARCHAR(255) NULL
);

-- ---------------------------------------------------------------------
-- 4. readings : one row per soil-moisture / temperature sample
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS readings (
  record_id      INT AUTO_INCREMENT PRIMARY KEY,
  device_id      INT NOT NULL,
  point_index    INT NOT NULL,
  moisture_raw   INT NULL,                        -- averaged 12-bit ADC value
  moisture_pct   DECIMAL(5,1) NOT NULL,
  temperature_c  DECIMAL(4,1) NOT NULL,
  status         ENUM('dry','normal','wet') NOT NULL,
  recommendation VARCHAR(80)  NOT NULL,
  was_buffered   TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = sent late from robot buffer
  recorded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_readings_device FOREIGN KEY (device_id) REFERENCES devices(device_id),
  CONSTRAINT fk_readings_point  FOREIGN KEY (point_index) REFERENCES sampling_points(point_index),
  INDEX idx_point_time (point_index, recorded_at)
);

-- ---------------------------------------------------------------------
-- 5. thresholds : decision-support limits (one row per setting)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS thresholds (
  setting_key    VARCHAR(40) PRIMARY KEY,
  setting_value  DECIMAL(6,2) NOT NULL,
  description    VARCHAR(120) NOT NULL,
  updated_by     INT NULL,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 6. robot_commands : operator-directed movement queue (dashboard -> robot)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS robot_commands (
  command_id     INT AUTO_INCREMENT PRIMARY KEY,
  device_id      INT NOT NULL,
  command        ENUM('GOTO','STOP','RETURN') NOT NULL,
  target_point   INT NULL,
  status         ENUM('pending','sent','done','cancelled') NOT NULL DEFAULT 'pending',
  issued_by      INT NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at   DATETIME NULL,
  CONSTRAINT fk_cmd_device FOREIGN KEY (device_id) REFERENCES devices(device_id),
  CONSTRAINT fk_cmd_user   FOREIGN KEY (issued_by) REFERENCES users(user_id)
);

-- ---------------------------------------------------------------------
-- 7. audit_log : security trail of logins and changes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  log_id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NULL,
  action         VARCHAR(40)  NOT NULL,
  detail         VARCHAR(255) NULL,
  ip_address     VARCHAR(45)  NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
