# YouTube Video Assistant Chrome Extension

This Chrome extension enhances your YouTube experience by providing an AI-powered assistant to answer questions about the video you're watching.

## Features

- AI-powered Q&A based on video content
- Transcript extraction from YouTube videos
- Customizable actions like summarizing, highlighting key points, and suggesting related topics
- Secure storage of OpenAI API key

## Installation

To install this extension locally for development or testing:

1. Clone this repository or download it as a ZIP file and extract it.

```bash
$ https://github.com/niketjain1/TubeSage.git
```

2. Open Google Chrome and navigate to `chrome://extensions/`.

3. Enable "Developer mode" by toggling the switch in the top right corner.

4. Click on "Load unpacked" button that appears after enabling developer mode.

5. Navigate to the directory where you cloned or extracted the extension files, and select the root folder.

6. The extension should now appear in your list of installed extensions.

## Setup

1. You'll need an OpenAI API key to use this extension. If you don't have one, you can get it from [OpenAI's website](https://openai.com/api/).

2. After installing the extension, click on the extension icon in the Chrome toolbar.

3. Enter your OpenAI API key in the settings modal and click "Save".

## Usage

1. Navigate to any YouTube video page.

2. The extension icon should become active. Click on it to open the assistant panel.

3. You can now ask questions about the video, and the AI will respond based on the video's content.

4. Use the "Actions" dropdown to access additional features like summarizing the video or listing key points.

## File Structure

- `manifest.json`: Extension configuration
- `background/`: Background scripts
- `content/`: Content scripts injected into YouTube pages
- `chatbot/`: Files for the chatbot extension
- `options/`: Files for the options page
- `lib/`: Third-party libraries
- `styles/`: CSS stylesheets
- `assets/`: Images and icons
