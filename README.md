# GradeView — Railway Deployment Guide

Everything runs on Railway: your Node.js app + MySQL database, all in one project.

---

## Step 1 — Create Railway Project with MySQL

1. Go to https://railway.app → New Project
2. Click Add a Service → choose MySQL
3. Wait for it to provision (~30 seconds)

---

## Step 2 — Import the Database

1. Click your MySQL service → Query tab
2. Paste the entire contents of database.sql → click Run

---

## Step 3 — Deploy the App

Option A — GitHub (recommended):
  git init && git add . && git commit -m "init"
  git remote add origin https://github.com/YOUR/gradeview.git
  git push -u origin main
  Then in Railway: New Service → GitHub Repo → pick repo → Deploy

Option B — Railway CLI:
  npm install -g @railway/cli
  railway login && railway link && railway up

---

## Step 4 — Add Environment Variables

In Railway → App service → Variables tab → Add Variable:

  MYSQLHOST      → Add Reference → MySQL → MYSQLHOST
  MYSQLPORT      → Add Reference → MySQL → MYSQLPORT
  MYSQLUSER      → Add Reference → MySQL → MYSQLUSER
  MYSQLPASSWORD  → Add Reference → MySQL → MYSQLPASSWORD
  MYSQLDATABASE  → Add Reference → MySQL → MYSQLDATABASE
  JWT_SECRET     → any random string e.g. MySecret@GradeView2024!

TIP: Use "Add Reference" to link directly from MySQL service.

---

## Step 5 — Generate Public URL

App service → Settings → Networking → Generate Domain

Your app is live at: https://gradeview-xxxx.railway.app

---

## Access

  Student Portal : https://your-app.railway.app/
  Admin Portal   : https://your-app.railway.app/admin/
  Default login  : admin / password
