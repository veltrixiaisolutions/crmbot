# WhatsApp AI Chatbot - Windows Quick Start Guide

This project includes pre-configured automation scripts specifically for Windows.

---

## 1. Prerequisites (Install once)

Before starting, make sure you have the following installed on your Windows machine:

1. **Python 3.10, 3.11, or 3.12**:
   - Download from: https://www.python.org/downloads/
   - ⚠️ **CRITICAL:** On the first installer screen, make sure to check the box:
     **☑ Add python.exe to PATH**
2. **Node.js (LTS version 18 or 20+)**:
   - Download from: https://nodejs.org/
   - Standard installer with default options.

---

## 2. Quick 1-Click Start

1. Extract the zip file to any folder on your computer (e.g. `C:\whatsappchatbot` or your Desktop).
2. Double-click **`start_windows.bat`**.
3. It will automatically:
   - Check Python and create a Windows virtual environment (`backend\venv`) on first run.
   - Install all backend dependencies (`pip install -r requirements.txt`).
   - Install all frontend dependencies (`npm install`) on first run.
   - Launch the **Backend (Port 8040)** in one command prompt window.
   - Launch the **Frontend (Port 3000)** in a second command prompt window.
4. Open your web browser and navigate to:
   - **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
   - **Backend API & Swagger Docs**: [http://localhost:8040/docs](http://localhost:8040/docs)

---

## 3. Manual Start (Optional)

If you prefer to run the services separately:

### Backend
1. Double click `run_backend.bat`  
   *OR open Command Prompt / PowerShell:*
   ```cmd
   cd backend
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8040
   ```

### Frontend
1. Double click `run_frontend.bat`  
   *OR open Command Prompt / PowerShell:*
   ```cmd
   cd frontend
   npm install
   npm run dev
   ```

---

## 4. Environment Variables (`.env`)

- **Backend (`backend\.env`)**:
  Contains your MongoDB connection string, Anthropic API key, Voyage AI key, WhatsApp token, and JWT secret.
  An `.env` is already included with your configuration. You can edit this file in Notepad or VS Code at any time.

- **Frontend (`frontend\.env.local`)**:
  Automatically created by `run_frontend.bat` if missing. Next.js proxies API calls to `http://127.0.0.1:8040`.

---

## 5. Webhook & WhatsApp Testing (Meta Cloud API)

To receive live incoming WhatsApp messages on your local Windows PC:
1. Download and run [ngrok](https://ngrok.com/):
   ```cmd
   ngrok http 8040
   ```
2. Copy your forwarding HTTPS URL (e.g. `https://xyz.ngrok-free.app`).
3. In your **Meta for Developers** WhatsApp configuration:
   - Webhook URL: `https://xyz.ngrok-free.app/webhook`
   - Verify Token: The token set in `backend\.env` (`WHATSAPP_VERIFY_TOKEN`).
