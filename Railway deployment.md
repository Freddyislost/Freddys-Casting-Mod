# 🚂 RAILWAY DEPLOYMENT GUIDE

## Prerequisites
- Railway account (https://railway.app)
- GitHub account (recommended) or Railway CLI
- Discord bot token ready

---

## 🚀 DEPLOYMENT STEPS

### Method 1: GitHub (Recommended)

1. **Create a GitHub Repository**
   ```bash
   cd discord-bot
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/freddys-ranked-bot.git
   git push -u origin main
   ```

2. **Deploy to Railway**
   - Go to https://railway.app
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will automatically detect Node.js and deploy

3. **Configure Environment Variables**
   In Railway project settings, add these variables:
   ```
   DISCORD_TOKEN=your_bot_token_here
   API_PORT=3000
   ```

4. **Get Your Public URL**
   - Go to Settings → Networking
   - Click "Generate Domain"
   - Copy the URL (e.g., `freddys-ranked.up.railway.app`)
   - Your API will be at: `https://freddys-ranked.up.railway.app/api`

5. **Update Your Mod**
   In BepInEx config or in your mod code:
   ```csharp
   DEFAULT_API_ENDPOINT = "https://freddys-ranked.up.railway.app/api"
   ```

---

### Method 2: Railway CLI

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login**
   ```bash
   railway login
   ```

3. **Initialize Project**
   ```bash
   cd discord-bot
   railway init
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Set Environment Variables**
   ```bash
   railway variables set DISCORD_TOKEN=your_token_here
   ```

6. **Get Domain**
   ```bash
   railway domain
   ```

---

## 🔧 RAILWAY CONFIGURATION

### Automatic Settings (via railway.json)
Railway will automatically:
- Detect Node.js
- Run `npm install`
- Start with `node bot.js`
- Restart on failure
- Allocate persistent storage

### Manual Settings (if needed)
1. **Build Command:** `npm install`
2. **Start Command:** `node bot.js`
3. **Port:** 3000 (automatically detected)

---

## 💾 PERSISTENT DATA ON RAILWAY

Railway provides persistent storage, but you need to mount it:

1. **Create Volume** in Railway dashboard:
   - Go to your service
   - Click "Settings" → "Volumes"
   - Add volume with mount path: `/app/data`

2. **Update bot.js** if needed:
   ```javascript
   this.dataDir = path.join(__dirname, 'data'); // Already correct!
   ```

Your data will persist across deployments.

---

## 🌐 UPDATE YOUR MOD CONFIG

After Railway deployment, update your C# mod:

### Option 1: Hardcode the URL
```csharp
private const string DEFAULT_API_ENDPOINT = "https://your-app.up.railway.app/api";
```

### Option 2: Keep it in BepInEx config
Users can edit the config file:
```
[API]
Endpoint = https://your-app.up.railway.app/api
```

---

## 📊 MONITORING

### View Logs
```bash
railway logs
```

Or in Railway dashboard:
- Go to your project
- Click on your service
- View "Deployments" tab
- Click "View Logs"

### Check Health
Visit: `https://your-app.up.railway.app/api/health`

Add this to bot.js:
```javascript
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});
```

---

## 🔒 ENVIRONMENT VARIABLES IN RAILWAY

Set these in Railway dashboard (Settings → Variables):

```
DISCORD_TOKEN=YOUR_BOT_TOKEN
API_PORT=3000
NODE_ENV=production
```

Optional - if you want to use .env pattern in code:
```bash
npm install dotenv
```

Then in bot.js (top of file):
```javascript
require('dotenv').config();

const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    API_PORT: process.env.PORT || 3000,
    // ... rest of config
};
```

---

## 🚨 TROUBLESHOOTING

### Bot won't start
- Check logs: `railway logs`
- Verify DISCORD_TOKEN is set
- Check Node.js version (Railway uses latest by default)

### Can't connect from mod
- Verify domain is generated
- Check if URL uses HTTPS
- Test endpoint: `curl https://your-app.up.railway.app/api/health`

### Data not persisting
- Ensure volume is created and mounted to `/app/data`
- Check permissions on data directory

### Port issues
- Railway automatically assigns $PORT
- Make sure you use `process.env.PORT || 3000`

---

## 📝 RAILWAY PRICING

**Free Tier:**
- $5 credit per month
- ~500 hours of usage
- Perfect for this bot

**Pro Plan ($5/month):**
- $5 credit + additional usage
- Priority support
- Custom domains

Your bot should easily run on free tier!

---

## 🔄 UPDATING YOUR BOT

### With GitHub:
```bash
git add .
git commit -m "Update bot"
git push
```
Railway auto-deploys on push!

### With CLI:
```bash
railway up
```

---

## 🎯 FINAL CHECKLIST

- [ ] Railway account created
- [ ] Repository pushed to GitHub (or using CLI)
- [ ] Project deployed on Railway
- [ ] Environment variables set (DISCORD_TOKEN)
- [ ] Domain generated
- [ ] Volume created for persistent data
- [ ] Mod updated with Railway URL
- [ ] Bot is online in Discord
- [ ] Test !linkaccount command
- [ ] Test room code creation

---

## 📍 YOUR URLs AFTER DEPLOYMENT

| Service | URL |
|---------|-----|
| Bot API | `https://your-app.up.railway.app/api` |
| Health Check | `https://your-app.up.railway.app/api/health` |
| Create Room | `https://your-app.up.railway.app/api/room/create` |
| Confirm Link | `https://your-app.up.railway.app/api/account/confirm-link` |
| Account Status | `https://your-app.up.railway.app/api/account/status` |
| Room Codes | `https://your-app.up.railway.app/api/room/codes` |

---

## 🎉 YOU'RE DEPLOYED!

Your bot is now running 24/7 on Railway!

Remember to update your C# mod with the Railway URL:
```csharp
private const string DEFAULT_API_ENDPOINT = "https://your-app.up.railway.app/api";
```

Test everything:
1. Open Gorilla Tag with your mod
2. Have a user type !linkaccount in Discord
3. They receive a 5-digit code (e.g., "12345")
4. You open the mod (TAB), enter "12345" in the linking section
5. Join room "LINK12345"
6. User gets automatically linked!

---

## 🆘 NEED HELP?

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check logs: `railway logs` or in dashboard
- Test endpoints with Postman or curl

Your ranked system is now live! 🎮
