# Home Assistant Time Machine

Home Assistant Time Machine is a web-based tool that acts as a "Time Machine" for your Home Assistant configuration. It allows you to browse yaml backups and restore individual automations and scripts to your live configuration.

## Screenshots

![Screenshot 1](https://i.imgur.com/tckqmy8.png)
![Screenshot 2](https://i.imgur.com/KOqjUYD.png)
![Screenshot 4](https://i.imgur.com/GWWwkht.png)
![Screenshot 3](https://i.imgur.com/LbjZobV.png)

## Features

*   **Browse Backups:** Easily browse through your Home Assistant backup yaml files.
*   **View Changes:** See a side-by-side diff of the changes between a backed-up item and the live version.
*   **Restore Individual Items:** Restore individual automations or scripts without having to restore an entire backup.
*   **Safety first:** It automatically creates a backup of your yaml files in your backups folder before restoring anything.
*   **Reload Home Assistant:** Reload automations or scripts in Home Assistant directly from the UI after a restore.
*   **Scheduled Backups:** Configure automatic backups of your Home Assistant configuration directly from the UI.

## Installation

There are two ways to install Home Assistant Time Machine: as a Home Assistant Add-on or as a standalone Docker container.

### 1. Home Assistant Add-on (Recommended for most users)

1.  Navigate to the Add-on store in your Home Assistant instance.
2.  Click on the three dots in the top right corner and select "Repositories".
3.  Paste the URL of this repository and click "Add":
    ```
    https://github.com/saihgupr/HomeAssistantTimeMachine
    ```
4.  The "Home Assistant Time Machine" addon will now appear in the store. Click on it and then click "Install".

### 2. Standalone Docker Installation

This method is for users who do not have the Home Assistant Add-on store or prefer to manage their own Docker containers.

#### Building the image from source

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/saihgupr/HomeAssistantTimeMachine.git
    cd HomeAssistantTimeMachine/homeassistant-time-machine
    ```

2.  **Build the Docker image:**
    ```bash
    docker build --build-arg BUILD_FROM=node:20-alpine -t ha-time-machine .
    ```

### Running the Container

Once you have the image, run it with this command:

```bash
docker run -d \
  -p 3000:3000 \
  -v /path/to/your/ha/config:/config \
  -v /path/to/your/backups:/backups \
  --name ha-time-machine \
  ha-time-machine
```

**Important:**
*   Replace `/path/to/your/ha/config` with the absolute path to your Home Assistant configuration directory.
*   Replace `/path/to/your/backups` with the absolute path to your backup directory.

After running the container, proceed to the "Usage" section to configure the application through its web UI at `http://localhost:3000`.

## Usage

1.  **Configure the addon:** In the addon's configuration tab, set the port for the web interface.
2.  **Start the addon.**
3.  **Open the Web UI or in a browser http://homeassistant.local:3000.**
4.  **In-app setup:**
    *   In the web UI, go to the settings menu.
    *   **Live Home Assistant Folder Path:** Set the path to your Home Assistant configuration directory (e.g., `/config`).
    *   **Backup Folder Path:** Set the path to the directory where your backups are stored (e.g., `/media/backups/yaml`).
    *   **Home Assistant URL & Token:** Set the URL and a Long-Lived Access Token for your Home Assistant instance. This is needed for the feature that reloads Home Assistant after a restore.
    *   **Enable Scheduled Backup:** Toggle this option to enable or disable automatic backups.
    *   **Frequency:** Choose how often you want backups to run (e.g., Hourly, Daily, Weekly).
    *   **Time:** If Daily or Weekly frequency is selected, specify the time of day for the backup to run.

## Creating Backups

This addon relies on having file-based backups of your Home Assistant configuration. You can now set up a scheduled backup directly within the UI. If you prefer to manage backups externally, here is an example of a simple shell script that you can use to create timestamped backups of your YAML files:

```bash
#!/bin/bash

# The directory where your Home Assistant configuration is stored.
# Adjust this to your setup.
CONFIG_DIR="/config"

# The root directory where you want to store your backups.
# This should match the "Backup Folder Path" you set in the addon's UI.
BACKUP_DIR="/media/backups/yaml"

# Create a timestamped directory for the new backup.
DATE=$(date +%Y-%m-%d-%H%M%S)
YEAR=$(date +%Y)
MONTH=$(date +%m)
BACKUP_PATH="$BACKUP_DIR/$YEAR/$MONTH/$DATE"
mkdir -p "$BACKUP_PATH"

# Copy the YAML files to the backup directory.
cp "$CONFIG_DIR"/*.yaml "$BACKUP_PATH"

echo "Backup created at $BACKUP_PATH"
```

**Important:**
*   You need to adjust the `CONFIG_DIR` and `BACKUP_DIR` variables in the script to match your Home Assistant setup.
*   You should run this script at a regular interval (e.g., every 24 hours) to have up-to-date backups. You can use a `cron` job on your host machine or a Home Assistant automation with a `shell_command` integration to automate this.

## Configuration

The addon can be configured through the Home Assistant UI.

*   **Web interface port:** The port on your host machine that will be mapped to the addon's web interface.

All other configuration is done within the application's web UI.
