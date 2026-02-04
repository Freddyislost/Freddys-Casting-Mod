# 🚀 Quick Start Guide - Freddy's Ranked System

## ⚡ 5-Minute Setup

### Step 1: Deploy Discord Bot (Railway)

```bash
# 1. Upload files to GitHub
git init
git add enhanced-bot.js package.json railway.json
git commit -m "Initial commit"
git push origin main

# 2. Deploy to Railway
# - Go to railway.app
# - Click "New Project" → "Deploy from GitHub"
# - Select your repository
# - Railway auto-deploys

# 3. Set Environment Variables in Railway
DISCORD_TOKEN=your_bot_token_here
API_PORT=3000
NODE_ENV=production

# 4. Generate Domain
# - Railway Settings → Networking → Generate Domain
# - Copy URL (e.g., freddys-ranked.up.railway.app)
```

### Step 2: Update Mod Configurations

**In both Player and Admin mods, update:**

```csharp
private const string DEFAULT_API_ENDPOINT = "https://your-railway-app.up.railway.app/api";
```

### Step 3: Configure Discord Bot

**Update in enhanced-bot.js:**

```javascript
DISCORD_TOKEN: 'your_actual_bot_token',

CHANNELS: {
    CODES: 'your_codes_channel_id',
    MMR_TRACKING: 'your_mmr_channel_id',
    REPORTS: 'your_reports_channel_id',
    REPORT_NOTIFICATIONS: 'your_notifications_channel_id'
},

ROLES: {
    BRONZE: 'your_bronze_role_id',
    SILVER: 'your_silver_role_id',
    GOLD: 'your_gold_role_id',
    DIAMOND: 'your_diamond_role_id',
    SAPPHIRE: 'your_sapphire_role_id',
    RUBY: 'your_ruby_role_id',
    COMP_BANNED: 'your_ban_role_id'  // Important!
}
```

### Step 4: Compile and Install Mods

**Player Mod:**
```bash
# 1. Compile FreddysRankedPlayerMod.cs
# 2. Place DLL in: BepInEx/plugins/
# 3. Launch game
# 4. Press TAB to open mod
```

**Admin Mod:**
```bash
# 1. Compile FreddysRankedAdminMod.cs
# 2. Place DLL in: BepInEx/plugins/
# 3. Launch game
# 4. Press TAB to open mod
# 5. Press P to toggle player list
```

---

## 🎮 First Use - Player Perspective

```
1. Discord: Type !linkaccount
   └─> Bot sends: "Join This Code With The Mod To Link Your Account: 45195"

2. Game: Press TAB to open mod
   └─> Enter code: 45195
   └─> Click "LINK ACCOUNT"
   └─> Automatically joins LINK45195 room

3. Discord: Bot confirms linking
   └─> "Account Linked! Rank: Bronze, MMR: 200"

4. Game: Press TAB, click tier button
   └─> "JOIN LOW RANK" (Bronze/Silver can only join LOW)
   └─> Auto-generates code like LOW452
   └─> Joins room

5. Play ranked games!
```

---

## 👨‍💼 First Use - Admin Perspective

```
1. Game: Press TAB to open admin mod
   └─> Click "CREATE LOW RANK ROOM"
   └─> Code generated: LOW837
   └─> Auto-joins room

2. Discord: Bot posts in codes channel
   └─> "New LOW Rank Room: LOW837"

3. Game: Wait for players
   └─> Press P to see player list
   └─> All players visible

4. Game: Click "START MATCH TRACKING"
   └─> Match begins
   └─> Tags auto-detected
   └─> Survival time tracked

5. Game: Click "END MATCH & CALCULATE MMR"
   └─> MMR calculated for all players
   └─> Sent to Discord bot

6. Discord: MMR updates posted
   └─> "@Player +35 MMR → 235 (Bronze)"
   └─> Ranks auto-updated
```

---

## 🔧 Testing Checklist

### Discord Bot
- [ ] Bot is online in Discord
- [ ] `!linkaccount` generates code
- [ ] DM is sent to user
- [ ] `!stats` shows player data
- [ ] `!leaderboard` displays top 10
- [ ] Rank roles are assigned correctly

### Player Mod
- [ ] TAB opens/closes menu
- [ ] Code entry works
- [ ] Linking joins LINK##### room
- [ ] DO NOT REMOVE.txt is created
- [ ] Rank buttons show correct access
- [ ] Ban detection works

### Admin Mod
- [ ] TAB opens/closes main menu
- [ ] P toggles player list
- [ ] Room creation works
- [ ] Match tracking starts
- [ ] Tags are detected
- [ ] MMR is calculated
- [ ] Discord receives updates

---

## 🎯 Common Commands

### Discord
```
!linkaccount          - Get linking code
!stats                - View your stats
!stats @user          - View someone's stats
!lb                   - Leaderboard
!unlink               - Unlink account
!mmr @user +50        - (Admin) Adjust MMR
```

### In-Game
```
TAB                   - Open/close mod menu
P                     - (Admin) Toggle player list
```

---

## 📊 Rank Progression Example

```
New Player
├─ Starts: 200 MMR (Bronze)
├─ Match 1: +35 MMR → 235 (Bronze)
├─ Match 2: +42 MMR → 277 (Bronze)
├─ Match 3: +28 MMR → 305 (Bronze)
...
├─ Match 15: +45 MMR → 505 (Silver) ← Rank up!
...
├─ Match 30: +38 MMR → 1015 (Gold) ← Tier upgrade! Can join MID rooms
...
├─ Match 50: +52 MMR → 2045 (Diamond)
...
├─ Match 75: +61 MMR → 3120 (Sapphire) ← Tier upgrade! Can join HIGH rooms
...
├─ Match 100: +70 MMR → 5230 (Ruby) ← Top rank!
```

---

## 🛠️ File Structure

```
Project/
│
├── Discord Bot/
│   ├── enhanced-bot.js        ← Main bot file
│   ├── package.json           ← Dependencies
│   ├── railway.json           ← Railway config
│   └── data/                  ← Auto-created
│       ├── accounts.json      ← Linked accounts
│       ├── codes.json         ← Active room codes
│       ├── linking.json       ← Linking codes
│       └── matches.json       ← Match history
│
├── Player Mod/
│   ├── FreddysRankedPlayerMod.cs
│   └── DO NOT REMOVE.txt      ← Created on linking
│
├── Admin Mod/
│   └── FreddysRankedAdminMod.cs
│
└── Documentation/
    ├── COMPLETE_SYSTEM_README.md
    └── QUICK_START_GUIDE.md (this file)
```

---

## 🔐 Security Checklist

- [ ] Discord bot token is secret (not in public repo)
- [ ] API endpoint uses HTTPS
- [ ] Ban role ID is correct
- [ ] Only admins have admin mod
- [ ] DO NOT REMOVE.txt validated on startup
- [ ] MMR updates require admin API access

---

## 🐛 Quick Debug

**Bot not responding?**
```bash
# Check Railway logs
railway logs

# Verify bot is online
# Check Discord server for bot presence
```

**Linking not working?**
```
1. Check bot sent DM
2. Verify code is 5 digits
3. Ensure code hasn't expired (10min)
4. Check API endpoint is correct
```

**MMR not updating?**
```
1. Admin must use admin mod
2. Match must be tracked (started)
3. Match must be ended manually
4. Check Discord MMR channel
```

**"YOU ARE COMP BANNED"?**
```
1. Check if user has ban role
2. Role ID: 1468452209950724116
3. Only admins can remove
```

---

## 📞 Support

If issues persist:

1. **Check Logs:**
   - Railway: `railway logs`
   - BepInEx: `BepInEx/LogOutput.log`

2. **Test Endpoints:**
   ```bash
   curl https://your-app.up.railway.app/api/health
   ```

3. **Verify Configuration:**
   - API endpoints match
   - Channel IDs correct
   - Role IDs correct

---

## 🎉 You're Ready!

Your ranked system is now live! Players can:
- Link accounts via Discord
- Join tier-appropriate rooms
- Earn/lose MMR based on performance
- Climb ranks from Bronze to Ruby
- Compete in organized matches

Admins can:
- Create ranked rooms
- Track matches in real-time
- Calculate MMR automatically
- Manage player progression

**Have fun with your ranked system!** 🏆
