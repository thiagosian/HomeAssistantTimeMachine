# Home Assistant Time Machine

Home Assistant Time Machine is a web-based tool that acts as a "Time Machine" for your Home Assistant configuration. It allows you to browse your existing file-based backups and restore individual automations and scripts to your live configuration.

## Features

*   **Browse Backups:** Easily browse through your existing Home Assistant backups.
*   **View Changes:** See a side-by-side diff of the changes between a backed-up item and the live version.
*   **Restore Individual Items:** Restore individual automations or scripts without having to restore an entire backup.
*   **Safety First:** Automatically creates a backup of your current configuration file before restoring an item.
*   **Reload Home Assistant:** Reload automations or scripts in Home Assistant directly from the UI after a restore.

## How to Use

1.  **Installation:** Add this repository as an addon repository in your Home Assistant Supervisor and install the "Home Assistant Time Machine" addon.
2.  **Configuration:**
    *   In the addon's configuration, set the port for the web interface.
    *   Start the addon.
    *   Open the web UI.
3.  **In-App Setup:**
    *   In the web UI, go to the settings.
    *   Set the "Live Home Assistant Folder Path". This is the path to your Home Assistant configuration directory (e.g., `/config`).
    *   Set the "Backup Folder Path". This is the path to the directory where your backups are stored.
    *   Set the "Home Assistant URL" and "Long-Lived Access Token". These are needed for the feature that reloads Home Assistant after a restore.

## Configuration

The addon can be configured through the Home Assistant UI.

*   **Web interface port:** The port on your host machine that will be mapped to the addon's web interface.

All other configuration is done within the application's web UI.

## Future Development

*   More robust error handling and user notifications.
*   Support for splitting automations and scripts into multiple files.
*   Automated tests.
