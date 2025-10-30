# <img src="https://raw.githubusercontent.com/saihgupr/HomeAssistantTimeMachine/main/images/icon.png" alt="Home Assistant Time Machine icon" width="40" height="40" align="center"> Home Assistant Time Machine

Home Assistant Time Machine is a web-based tool that acts as a "Time Machine" for your Home Assistant configuration. Browse YAML backups across automations, scripts, Lovelace dashboards, ESPHome files, and packages, then restore individual items back to your live setup with confidence.

## What's New!

*   **Ingress Support:** Full support for Home Assistant ingress, allowing seamless access through the Home Assistant UI without port forwarding.
*   **Lovelace Backup Support:** Comprehensive backup and restore functionality for your Lovelace UI configurations, ensuring your dashboards are always safe.
*   **ESPHome & Packages Backup Support:** Enable backups for ESPHome and Packages via a toggle in the add-on configuration.
*   **Backup Now Button:** Trigger an immediate backup of your Home Assistant configuration directly from the UI with a single click. This utilizes a new API for programmatic backups, shared with the scheduled backup feature.
*   **Max Backups:** Set a limit on how many backups are kept.
*   **Authentication:** Secure access with Home Assistant authentication integration, automatically proxying through the Supervisor when available.
*   **Docker Container Installation:** Simplified installation process with a dedicated Docker container option, providing more flexibility for users without the Home Assistant add-on store.
*   **Optimized Size & Performance:** The add-on is now 4X smaller and uses 6X less memory, making it faster to download and run.  
*   **Dark/Light Mode:** Choose between dark and light themes in the configuration.
*   **Flexible Backup Locations:** Backups can now be stored in `/share` `/backup` `/config` or `/media`. Folders are created automatically, and remote share backups are supported.
*   **REST API:** Comprehensive API for managing backups, restores, and configurations.

## Screenshots

![Screenshot 1](https://raw.githubusercontent.com/saihgupr/HomeAssistantTimeMachine/main/images/1.png)
![Screenshot 2](https://raw.githubusercontent.com/saihgupr/HomeAssistantTimeMachine/main/images/2.png)
![Screenshot 3](https://raw.githubusercontent.com/saihgupr/HomeAssistantTimeMachine/main/images/3.png)
![Screenshot 4](https://raw.githubusercontent.com/saihgupr/HomeAssistantTimeMachine/main/images/4.png)
![Screenshot 5](https://raw.githubusercontent.com/saihgupr/HomeAssistantTimeMachine/main/images/5.png)

## Features

*   **Browse Backups:** Easily browse through your Home Assistant backup YAML files.
*   **View Changes:** See a side-by-side diff of the changes between a backed-up item and the live version.
*   **Restore Individual Items:** Restore individual automations or scripts without having to restore an entire backup.
*   **Safety first:** It automatically creates a backup of your YAML files in your backups folder before restoring anything.
*   **Reload Home Assistant:** Reload automations or scripts in Home Assistant directly from the UI after a restore.
*   **Scheduled Backups:** Configure automatic backups of your Home Assistant configuration directly from the UI.

## Installation

There are two ways to install Home Assistant Time Machine: as a Home Assistant add-on or as a standalone Docker container.

### 1. Home Assistant add-on (Recommended for most users)

1.  Navigate to the Add-on Store in your Home Assistant instance.
2.  Click on the three dots in the top right corner and select "Repositories".
3.  Paste the URL of this repository and click "Add":
    ```
    https://github.com/saihgupr/HomeAssistantTimeMachine
    ```
4.  The "Home Assistant Time Machine" add-on will now appear in the store. Click on it and then click "Install".

### 2. Standalone Docker Installation

Build and run the container locally when you aren’t using the Home Assistant add-on.

**Clone, build, and start (recommended):**

```bash
git clone https://github.com/saihgupr/HomeAssistantTimeMachine.git
cd HomeAssistantTimeMachine/homeassistant-time-machine
docker build -t ha-time-machine .

docker run -d \
  -p 54000:54000 \
  -e HOME_ASSISTANT_URL="http://your-ha-instance:8123" \
  -e LONG_LIVED_ACCESS_TOKEN="your-long-lived-access-token" \
  -v /path/to/your/ha/config:/config \
  -v /path/to/your/backups:/media \
  -v ha-time-machine-data:/data \
  --name ha-time-machine \
  ha-time-machine
```

Supplying the URL and token keeps credentials out of the UI. These environment variables are optional—if you set them, the settings fields are read-only; if you omit them, you can enter credentials in the web UI instead. They are stored in `/data/docker-ha-credentials.json`.

#### Changing Options in Docker

After the container is running, you can toggle ESPHome support, adjust text style, and switch light/dark modes by POSTing to the app settings API. This persists the value in `/data/homeassistant-time-machine/docker-app-settings.json` so the UI reflects it on reload:

```bash
curl -X POST http://localhost:54000/api/app-settings \
  -H 'Content-Type: application/json' \
  -d '{
        "liveConfigPath": "/config",
        "backupFolderPath": "/media/timemachine",
        "textStyle": "default",
        "theme": "dark",
        "esphomeEnabled": true,
        "packagesEnabled": true
      }'
```

Adjust the payload if you need different paths, theme, text style, or want to enable/disable features (`"esphomeEnabled": true|false`, `"packagesEnabled": true|false`, `"theme": light|dark`, `"textStyle": default|pirate|hacker|noir_detective|personal_trainer|scooby_doo`).

#### Accessing the Web Interface

After starting the container, access the web interface at `http://localhost:54000` (or your server's IP/port).

**Note:** The HA URL and token fields in settings will be read-only if configured via environment variables, or editable if configured through the web UI.

## Usage

### Home Assistant add-on

1.  **Configure the add-on:** In the add-on's configuration tab, set the Home Assistant URL and Long-Lived Access Token.
2.  **Start the add-on.**
3.  **Open the Web UI:**
    *   Use **Open Web UI** from the add-on panel to launch ingress (default recommended when the external port is disabled).
    *   Or, if you've enabled port `54000/tcp` in the add-on configuration, browse to `http://homeassistant.local:54000` (or your configured host/port).
4.  **In-app setup:**
    *   In the web UI, go to the settings menu.
    *   **Live Home Assistant Folder Path:** Set the path to your Home Assistant configuration directory (e.g., `/config`).
    *   **Backup Folder Path:** Set the path to the directory where your backups are stored (e.g., `/media/timemachine`).

### Docker Container

1.  **Start the container** with the required volume mounts (see Docker installation above).
2.  **Open the Web UI** at `http://localhost:54000` (or your server's IP/port).
3.  **In-app setup:**
    *   In the web UI, go to the settings menu.
    *   **Live Home Assistant Folder Path:** Set to `/config` (this is the mounted volume).
    *   **Backup Folder Path:** Set to `/media/timemachine` (this is the mounted volume).

## Backup to Remote Share

To configure backups to a remote share, first set up network storage within Home Assistant (Settings > System > Storage > 'Add network storage'). Name the share 'backups' and set its usage to 'Media'. Once configured, you can then specify the backup path in Home Assistant Time Machine settings as '/media/backups', which will direct backups to your remote share.

## Creating Backups

This add-on relies on having file-based backups of your Home Assistant configuration. You can now set up a scheduled backup directly within the UI. If you prefer to manage backups externally, here is an example of a simple shell script that you can use to create timestamped backups of your YAML files:

> **Important:** The paths in this script (for example, `/homeassistant`) are placeholders. Adjust them to match your actual Home Assistant configuration directory (such as `/config` on HAOS).

```bash
#!/bin/bash

DATE=$(date +%Y-%m-%d-%H%M%S)

YEAR=$(date +%Y)

MONTH=$(date +%m)

### HOME ASSISTANT ###
mkdir -p  /media/timemachine/$YEAR/$MONTH/"$DATE"
cp /homeassistant/*.yaml /media/timemachine/$YEAR/$MONTH/"$DATE"

### Lovelace ###
mkdir -p  /media/timemachine/$YEAR/$MONTH/"$DATE"/.storage
cp /homeassistant/.storage/lovelace /media/timemachine/$YEAR/$MONTH/"$DATE"/.storage
cp /homeassistant/.storage/lovelace_dashboards /media/timemachine/$YEAR/$MONTH/"$DATE"/.storage
cp /homeassistant/.storage/lovelace_resources /media/timemachine/$YEAR/$MONTH/"$DATE"/.storage
cp /homeassistant/.storage/lovelace.* /media/timemachine/$YEAR/$MONTH/"$DATE"/.storage

### ESPHOME ###
mkdir -p  /media/timemachine/$YEAR/$MONTH/"$DATE"/esphome
cp /homeassistant/esphome/*.yaml /media/timemachine/$YEAR/$MONTH/"$DATE"/esphome

### PACKAGES ###
mkdir -p  /media/timemachine/$YEAR/$MONTH/"$DATE"/packages
cp /homeassistant/packages/*.yaml /media/timemachine/$YEAR/$MONTH/"$DATE"/packages
```

**Important:**
*   Run this script at a regular interval (e.g., every 24 hours) to keep backups current. You can use a `cron` job on your host machine or a Home Assistant automation with a `shell_command` integration to automate it.



## API Endpoints

- **POST /api/backup-now**: Trigger an immediate backup (requires `liveFolderPath` and `backupFolderPath`).
- **POST /api/restore-automation** / **POST /api/restore-script**: Restore a single automation or script after creating a safety backup.
- **POST /api/restore-lovelace-file** / **POST /api/restore-esphome-file** / **POST /api/restore-packages-file**: Restore Lovelace, ESPHome, or package files with automatic pre-restore backups.
- **POST /api/get-backup-* ** & **/api/get-live-* ** families: Fetch specific items from backups or the live config (automations, scripts, Lovelace, ESPHome, packages).
- **GET /api/schedule-backup** / **POST /api/schedule-backup**: Inspect or update scheduled backup jobs.
- **POST /api/scan-backups**: Scan the backup directory tree and list discovered backups.
- **POST /api/validate-path** / **POST /api/validate-backup-path**: Verify that provided directories exist and contain Home Assistant data/backups.
- **POST /api/test-home-assistant-connection**: Confirm stored Home Assistant credentials work before saving.
- **POST /api/reload-home-assistant**: Invoke a Home Assistant reload service (e.g., `automation.reload`).
- **GET /api/health**: Simple status endpoint exposing version, ingress state, and timestamp.

Example usage:
```bash
# Trigger backup
curl -X POST http://localhost:54000/api/backup-now \
  -H "Content-Type: application/json" \
  -d '{"liveFolderPath": "/config", "backupFolderPath": "/media/timemachine"}'

# Get scheduled jobs
curl http://localhost:54000/api/schedule-backup

# Scan backups
curl -X POST http://localhost:54000/api/scan-backups \
  -H "Content-Type: application/json" \
  -d '{"backupRootPath": "/media/timemachine"}'
```

## Support, Feedback & Contributing

- File issues or feature requests at [GitHub Issues](https://github.com/saihgupr/HomeAssistantTimeMachine/issues).
- Pull requests are welcome—check existing issues or propose enhancements.
- Share feedback on usability so we can keep refining backup workflows.