# TalkSync — User Guide & Setup

**TalkSync** is your AI-powered interview assistant. It listens to your interview in real-time and provides smart, context-aware answers based on your resume and job description.

## 📥 Download & Install

**[Download Latest Windows Installer (.exe)](https://github.com/royalraaj/talksync/releases/latest)**

*OR, if you just built it locally, you can find the installer at:*
`src-tauri/target/debug/bundle/nsis/TalkSync_0.2.0_x64-setup.exe`

1.  Get the installer (from link above or local path).
2.  Download `TalkSync_0.2.0_x64-setup.exe`.
3.  Run the installer.
4.  Launch **TalkSync** from your desktop or start menu.

> **Note:** Since this app is not signed with a costly certificate yet, Windows might show a "SmartScreen" warning. Click **"More Info" -> "Run Anyway"** to install.

2.  **Initial Launch:**
    - The app will open as a transparent overlay in "Home" mode.
    - Click the **Settings (⚙️)** icon in the top right.

## 🔑 key Setup (Required)

To make TalkSync work, you need two API keys. These are stored locally on your device.

### 1. Speech-to-Text (Deepgram)
*Required for listening to the interviewer.*
1.  Go to [console.deepgram.com](https://console.deepgram.com)
2.  Sign up (free tier gives $200 credit).
3.  Create a new API Key.
4.  Copy and paste it into TalkSync settings under **Speech-to-Text**.

### 2. AI Intelligence (LLM)
*Required for generating answers.*
Choose **one** provider:
- **OpenAI:** [platform.openai.com](https://platform.openai.com/api-keys) (Recommended: `gpt-4o`)
- **Anthropic:** [console.anthropic.com](https://console.anthropic.com) (Recommended: `claude-3-5-sonnet`)
- **Groq:** [console.groq.com](https://console.groq.com) (Fastest, free tier available)
- **Google Gemini:** [aistudio.google.com](https://aistudio.google.com)

Enter the API key in TalkSync settings and select your model.

### 3. Window Opacity
- Adjust the **Opacity Slider** in settings to make the window more or less transparent (70% is recommended).

## 🎧 How to Use

### 1. Start a Session
1.  Click **➕ New Interview Session**.
2.  **Resume:** Paste your resume text.
3.  **Job Description:** Paste the JD for the role you're interviewing for.
4.  **Company:** (Optional) Type the company name or paste a brief to help the AI understand the contest.
5.  Click **Start Session**.

### 2. During the Interview
- **Positioning:** Drag the window (from the top bar) to cover the interview video or place it near your webcam.
- **Stealth Mode:** The window is "click-through" safe in some areas, but mainly it sits on top.
- **Answers:** When the interviewer speaks, TalkSync transcribes the question.
    - **Wait 2 seconds:** The AI waits for a pause before answering.
    - **Read:** The answer appears automatically.
    - **Quick Actions:** Use "Make Shorter", "Add Example", or "Deep Dive" buttons to instantly rewrite the answer.
    - **Follow-ups:** If they ask "Tell me more?", TalkSync knows context from the previous answer.

### 3. Controls
- **Hide/Show:** Press `Ctrl + Shift + I` to instantly toggle visibility.
- **Drag:** Click and hold the top bar to move.
- **Close:** Click `×` in the top right to end session.

## ✅ DOs and ❌ DON'Ts

### DO
- **DO** use headphones. If you use speakers, the microphone might pick up the interviewer's voice *and* your system audio, causing echo.
- **DO** text your audio setup before the real interview.
- **DO** keep eye contact with the camera (TalkSync helps by being transparent).
- **DO** use the `Ctrl + Shift + I` shortcut if you need to hide the app quickly.

### DON'T
- **DON'T** read the answers robotically. Use them as bullet points or a "safety net."
- **DO** feel free to share your full desktop. TalkSync uses advanced Windows native APIs (`WDA_EXCLUDEFROMCAPTURE`) to remain completely invisible to screen sharing tools (Zoom, Teams, etc.) even when you share your entire screen.
- **DON'T** panic if it misses a word. The AI is robust and understands context even with minor transcription errors.

## 💾 Data Storage

All your data is stored locally on your machine — nothing is sent to the cloud (except API calls to the provider you choose).

### 🛡️ Reliability Features
- **Auto-Reconnect:** If your internet blips, TalkSync automatically attempts to reconnect to the transcription engine (Deepgram) with exponential backoff.
- **Crash Protection:** A robust error boundary ensures the app doesn't white-screen if an unexpected error occurs.

### Where is my data?
- **Windows:** `%APPDATA%/com.raj.talksync/`
  - `settings.json` — Your API keys, selected provider, opacity
  - `sessions/` — Individual session files (resume, JD, transcript, AI answers)

### Backup & Restore
- To **back up**, copy the `com.raj.talksync` folder
- To **restore**, paste it back into `%APPDATA%/`
- Data survives app updates and browser cache clears

### Migration
If you're upgrading from v0.1.x, your existing data in localStorage will be **automatically migrated** to the new file-based storage on first launch. No action needed.

## 🛠 Troubleshooting
- **No Transcription?** Check your internet connection and Deepgram API key.
- **No Answer?** Ensure your LLM API key is correct and you have credits.
- **Window disappeared?** Press `Ctrl + Shift + I` to bring it back.
