# Home Assistant Time Machine

Home Assistant Time Machine is a web-based tool that acts as a "Time Machine" for your Home Assistant configuration. It allows you to browse your existing file-based backups and restore individual automations and scripts to your live configuration.

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

## Configuration

The addon can be configured through the Home Assistant UI.

*   **Web interface port:** The port on your host machine that will be mapped to the addon's web interface.

All other configuration is done within the application's web UI.