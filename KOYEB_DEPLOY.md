# Deploy to Koyeb (Free)

Your PREGASQUAD Manager is ready to deploy on Koyeb!

## What You Get Free:
- Web app with custom URL
- PostgreSQL database
- WebSocket support (real-time notifications work!)
- Auto-sleeps when not used (saves resources)

---

## Step 1: Create Koyeb Account

1. Go to **https://app.koyeb.com**
2. Sign up with GitHub (recommended) or email
3. No credit card needed

---

## Step 2: Create Free Database

1. In Koyeb, click **"Create Service"**
2. Select **"Database"**
3. Choose **"PostgreSQL"**
4. Select **"Free"** plan
5. Region: **Frankfurt** or **Washington DC**
6. Name: `pregasquad-db`
7. Click **"Create"**
8. Wait for it to be ready
9. **Copy the "Connection String"** - you'll need it!

---

## Step 3: Upload to GitHub

Make sure your code is on GitHub at:
**https://github.com/duchenetom-cyber/mng**

Upload the extracted files (not a zip file!)

---

## Step 4: Deploy Your App

1. In Koyeb, click **"Create Service"**
2. Select **"Web Service"**
3. Click **"GitHub"**
4. Connect your GitHub account if needed
5. Select your repository: **mng**

### Configure the service:

| Setting | Value |
|---------|-------|
| Builder | Docker |
| Instance | Free |
| Region | Same as database |
| Port | 5000 |

### Add Environment Variables:

Click **"Environment variables"** and add:

| Name | Value |
|------|-------|
| `DATABASE_URL` | (paste your database connection string) |
| `SESSION_SECRET` | any-random-text-here-123 |
| `NODE_ENV` | production |

6. Click **"Deploy"**

---

## Step 5: Wait and Access

1. Wait 5-10 minutes for build
2. Your app will be at: `https://your-app-name.koyeb.app`
3. Done!

---

## Notes

- **Free tier sleeps** after inactivity
- First visit after sleep takes ~30 seconds
- Your data stays safe in the database
- WebSockets work - real-time notifications function properly

---

## Troubleshooting

**Build failed?**
- Check Koyeb logs for errors
- Make sure DATABASE_URL is set correctly

**Database errors?**
- Verify connection string is correct
- Check database is in same region as app

**App not loading?**
- Check the port is set to 5000
- Look at deployment logs for errors
