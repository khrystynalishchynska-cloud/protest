# Protest Gallery

## Overview
The Protest Gallery project is a web application that showcases various items related to protests and social movements. It features a dynamic gallery that allows users to explore items in different views: grid view, explore view, and list view.

## Files and Directories
- **welcome.html**: The welcome page for the application, containing the basic HTML structure and links to CSS and JavaScript files.
- **style.css**: Contains styles for the application, including layout and design for the gallery and view options.
- **js/infinite-gallery.js**: Implements infinite scrolling functionality for the gallery, loading items dynamically as the user scrolls.
- **js/view-toggle.js**: Manages the functionality to switch between grid view, explore view, and list view, updating the gallery display based on user interactions.
- **data/items.json**: Contains the data for the items displayed in the gallery, structured in JSON format with properties for each item, such as title, image URL, and description.
- **package.json**: Configuration file for npm, listing dependencies and scripts for the project.

## Setup Instructions
1. Clone the repository to your local machine.
2. Navigate to the project directory.
3. Install the necessary dependencies using npm:
   ```
   npm install
   ```
4. Open `welcome.html` in your web browser to view the application.

## Usage
- Use the buttons provided on the welcome page to switch between different views of the gallery.
- Scroll down to load more items dynamically in the selected view.

## Additional Information
This project aims to provide a platform for raising awareness about various social issues through visual storytelling. Contributions and feedback are welcome!