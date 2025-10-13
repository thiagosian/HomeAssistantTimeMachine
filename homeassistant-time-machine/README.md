# Home Assistant Time Machine

Home Assistant Time Machine is a web-based tool that acts as a "Time Machine" for your Home Assistant configuration. It allows you to browse your existing file-based backups and restore individual automations and scripts to your live configuration.

## Screenshots

![Screenshot 1](https://i.imgur.com/ZThQc5r.png)
![Screenshot 2](https://i.imgur.com/AUJdMKB.png)
![Screenshot 3](https://i.imgur.com/c8qRHxA.png)
![Screenshot 4](https://i.imgur.com/hZqJw04.png)

## Features

*   **Browse Backups:** Easily browse through your existing Home Assistant backups.
*   **View Changes:** See a side-by-side diff of the changes between a backed-up item and the live version.
*   **Restore Individual Items:** Restore individual automations or scripts without having to restore an entire backup.
*   **Safety First:** Automatically creates a backup of your current configuration file before restoring an item.
*   **Reload Home Assistant:** Reload automations or scripts in Home Assistant directly from the UI after a restore.

## Installation

1.  Navigate to the Add-on store in your Home Assistant instance.
2.  Click on the three dots in the top right corner and select "Repositories".
3.  Paste the URL of this repository and click "Add":
    ```
    https://github.com/saihgupr/HomeAssistantTimeMachine
    ```
4.  The "Home Assistant Time Machine" addon will now appear in the store. Click on it and then click "Install".

## Usage

1.  **Configure the addon:** In the addon's configuration tab, set the port for the web interface.
2.  **Start the addon.**
3.  **Open the Web UI.**
4.  **In-app setup:**
    *   In the web UI, go to the settings menu.
    *   **Live Home Assistant Folder Path:** Set the path to your Home Assistant configuration directory (e.g., `/config`).
    *   **Backup Folder Path:** Set the path to the directory where your backups are stored.
    *   **Home Assistant URL & Token:** Set the URL and a Long-Lived Access Token for your Home Assistant instance. This is needed for the feature that reloads Home Assistant after a restore.

## Creating Backups

This addon relies on having file-based backups of your Home Assistant configuration. You need to set up a process to create these backups regularly.

Here is an example of a simple shell script that you can use to create timestamped backups of your YAML files:

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