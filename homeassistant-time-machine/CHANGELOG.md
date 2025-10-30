# v2.0.0

## What's New!
- Added full **Ingress support**, allowing direct access through the Home Assistant UI — no port forwarding required.  
- Introduced **Lovelace dashboard backup and restore**, now included automatically in all backups.  
- Added configurable **ESPHome** and **Packages** backup support — enable these in the add-on configuration.  
- Implemented a **Backup Now** button in the UI for instant manual backups.  
- Added **Max Backups** retention setting to manage storage limits.  
- Integrated **proper authentication** using Home Assistant tokens, automatically proxied through the Supervisor.  
- Added **Docker container option** for running standalone outside the add-on store.  
- Optimized image to be **4X smaller and faster**, significantly reducing size and memory usage.  
- Introduced **Dark and Light mode themes** for the web UI.  
- Enabled **flexible backup locations**, supporting `/share`, `/backup`, `/config`, `/media`, and remote mounts.  
- Exposed a **full REST API** for automation of backups and restores.  