const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    DISCORD_TOKEN: 'MTQ2NTA3NDQxMDc4MzI0ODU3MA.GF0L7C.uhVM0sZObYCw4mpsX-YPRVcPrciLcNeSxKAcZQ',
    API_PORT: 3000,
    
    CHANNELS: {
        CODES: '1465062694620237854',
        REPORTS: '1404477029402808525',
        REPORT_NOTIFICATIONS: '1465060409102041118',
        MMR_TRACKING: '1465062863650557984'
    },
    
    ROLES: {
        BRONZE: '1468435586116489388',
        SILVER: '1468435649756659712',
        GOLD: '1468435997837754419',
        DIAMOND: '1468436117404651552',
        SAPPHIRE: '1468436338725490881',
        RUBY: '1468436386032914534',
        COMP_BANNED: '1468452209950724116'  // Ban role
    },
    
    RANK_CONFIG: {
        BRONZE: { name: 'Bronze', mmrRange: [0, 499], tier: 'low', emoji: '🥉', roleId: '1468435586116489388' },
        SILVER: { name: 'Silver', mmrRange: [500, 999], tier: 'low', emoji: '🥈', roleId: '1468435649756659712' },
        GOLD: { name: 'Gold', mmrRange: [1000, 1999], tier: 'mid', emoji: '🥇', roleId: '1468435997837754419' },
        DIAMOND: { name: 'Diamond', mmrRange: [2000, 2999], tier: 'mid', emoji: '💎', roleId: '1468436117404651552' },
        SAPPHIRE: { name: 'Sapphire', mmrRange: [3000, 4999], tier: 'high', emoji: '💠', roleId: '1468436338725490881' },
        RUBY: { name: 'Ruby', mmrRange: [5000, 99999], tier: 'high', emoji: '🔴', roleId: '1468436386032914534' }
    },
    
    MMR_SETTINGS: {
        TAG_GIVEN: 15,           // Points for tagging someone
        TAGGED: -12,             // Points lost when tagged
        SURVIVAL_PER_SECOND: 0.5, // Points per second survived
        STARTING_TAGGER_BONUS: 10, // Bonus for starting tagger if they tag someone
        STARTING_MMR: 200,
        REPORT_MMR_PENALTY: -50
    },
    
    TARGET_PLAYFAB_ID: '8AF48285BEE7E5F5'
};

// ============================================
// DATA STORAGE
// ============================================
class DataManager {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.accountsFile = path.join(this.dataDir, 'accounts.json');
        this.codesFile = path.join(this.dataDir, 'codes.json');
        this.linkingFile = path.join(this.dataDir, 'linking.json');
        this.matchesFile = path.join(this.dataDir, 'matches.json');
        
        this.ensureDataDir();
        this.accounts = this.loadData(this.accountsFile, {});
        this.activeCodes = this.loadData(this.codesFile, []);
        this.linkingCodes = this.loadData(this.linkingFile, {});
        this.matches = this.loadData(this.matchesFile, []);
    }
    
    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }
    
    loadData(filepath, defaultValue) {
        try {
            if (fs.existsSync(filepath)) {
                return JSON.parse(fs.readFileSync(filepath, 'utf8'));
            }
        } catch (error) {
            console.error(`Error loading ${filepath}:`, error);
        }
        return defaultValue;
    }
    
    saveData(filepath, data) {
        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`Error saving ${filepath}:`, error);
        }
    }
    
    getAccount(discordId) {
        return this.accounts[discordId] || null;
    }
    
    getAccountByPlayFabId(playFabId) {
        for (const [discordId, account] of Object.entries(this.accounts)) {
            if (account.playFabId === playFabId) {
                return { discordId, ...account };
            }
        }
        return null;
    }
    
    getAccountByPhotonId(photonId) {
        // Legacy support - kept for backward compatibility
        for (const [discordId, account] of Object.entries(this.accounts)) {
            if (account.photonId === photonId || account.playFabId === photonId) {
                return { discordId, ...account };
            }
        }
        return null;
    }
    
    createAccount(discordId, playFabId, temporaryPhotonName) {
        this.accounts[discordId] = {
            playFabId: playFabId,
            photonId: temporaryPhotonName, // The temp name they used to link
            mmr: CONFIG.MMR_SETTINGS.STARTING_MMR,
            wins: 0,
            losses: 0,
            tags: 0,
            timesSurvived: 0,
            linkedAt: Date.now()
        };
        this.saveData(this.accountsFile, this.accounts);
    }
    
    updateMMR(discordId, mmrChange, statsUpdate = {}) {
        if (!this.accounts[discordId]) return;
        
        this.accounts[discordId].mmr += mmrChange;
        if (this.accounts[discordId].mmr < 0) {
            this.accounts[discordId].mmr = 0;
        }
        
        // Update stats
        if (statsUpdate.isWin !== undefined) {
            if (statsUpdate.isWin) {
                this.accounts[discordId].wins++;
            } else {
                this.accounts[discordId].losses++;
            }
        }
        
        if (statsUpdate.tags) {
            this.accounts[discordId].tags += statsUpdate.tags;
        }
        
        if (statsUpdate.survived) {
            this.accounts[discordId].timesSurvived++;
        }
        
        this.saveData(this.accountsFile, this.accounts);
        return this.accounts[discordId];
    }
    
    createLinkingSession(discordId) {
        // Generate unique 5-digit Photon name
        let photonName;
        do {
            photonName = Math.floor(10000 + Math.random() * 90000).toString();
        } while (this.linkingCodes[photonName]); // Ensure unique
        
        this.linkingCodes[photonName] = {
            discordId: discordId,
            photonName: photonName,
            createdAt: Date.now(),
            expiresAt: Date.now() + (10 * 60 * 1000),
            linked: false
        };
        this.saveData(this.linkingFile, this.linkingCodes);
        return photonName;
    }
    
    getLinkingSession(photonName) {
        const linkData = this.linkingCodes[photonName];
        if (!linkData) return null;
        
        if (Date.now() > linkData.expiresAt) {
            delete this.linkingCodes[photonName];
            this.saveData(this.linkingFile, this.linkingCodes);
            return null;
        }
        
        return linkData;
    }
    
    removeLinkingSession(photonName) {
        delete this.linkingCodes[photonName];
        this.saveData(this.linkingFile, this.linkingCodes);
    }
    
    getAllPendingLinks() {
        const now = Date.now();
        const pending = {};
        
        for (const [photonName, data] of Object.entries(this.linkingCodes)) {
            if (!data.linked && data.expiresAt > now) {
                pending[photonName] = data;
            }
        }
        
        return pending;
    }
    
    generateLinkingCode() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }
    
    addRoomCode(code, tier, createdBy) {
        this.activeCodes.push({
            code: code,
            tier: tier,
            createdBy: createdBy,
            createdAt: Date.now()
        });
        
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.activeCodes = this.activeCodes.filter(c => c.createdAt > oneHourAgo);
        
        this.saveData(this.codesFile, this.activeCodes);
    }
    
    getRoomCodesByTier(tier) {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return this.activeCodes.filter(c => 
            c.tier === tier && c.createdAt > fiveMinutesAgo
        );
    }
    
    getAllActiveCodes() {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return this.activeCodes.filter(c => c.createdAt > fiveMinutesAgo);
    }
    
    // Match tracking for MMR calculations
    startMatch(roomCode, players) {
        const match = {
            id: Date.now().toString(),
            roomCode: roomCode,
            players: players,
            startTime: Date.now(),
            tags: [],
            active: true
        };
        this.matches.push(match);
        this.saveData(this.matchesFile, this.matches);
        return match.id;
    }
    
    recordTag(matchId, tagger, tagged) {
        const match = this.matches.find(m => m.id === matchId);
        if (match) {
            match.tags.push({
                tagger: tagger,
                tagged: tagged,
                timestamp: Date.now()
            });
            this.saveData(this.matchesFile, this.matches);
        }
    }
    
    endMatch(matchId) {
        const match = this.matches.find(m => m.id === matchId);
        if (match) {
            match.active = false;
            match.endTime = Date.now();
            this.saveData(this.matchesFile, this.matches);
            return match;
        }
        return null;
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getRankFromMMR(mmr) {
    for (const [rankName, rankData] of Object.entries(CONFIG.RANK_CONFIG)) {
        if (mmr >= rankData.mmrRange[0] && mmr <= rankData.mmrRange[1]) {
            return { name: rankName, ...rankData };
        }
    }
    return CONFIG.RANK_CONFIG.BRONZE;
}

function canAccessTier(mmr, tier) {
    const rank = getRankFromMMR(mmr);
    return rank.tier === tier;
}

async function updateUserRoles(guild, userId, mmr) {
    try {
        const member = await guild.members.fetch(userId);
        const rank = getRankFromMMR(mmr);
        
        // Remove all rank roles
        for (const rankData of Object.values(CONFIG.RANK_CONFIG)) {
            const role = guild.roles.cache.get(rankData.roleId);
            if (role && member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
            }
        }
        
        // Add new rank role
        const newRole = guild.roles.cache.get(rank.roleId);
        if (newRole) {
            await member.roles.add(newRole);
        }
        
        return rank;
    } catch (error) {
        console.error('Error updating user roles:', error);
        return null;
    }
}

async function isUserBanned(guild, userId) {
    try {
        const member = await guild.members.fetch(userId);
        return member.roles.cache.has(CONFIG.ROLES.COMP_BANNED);
    } catch (error) {
        console.error('Error checking ban status:', error);
        return false;
    }
}

// ============================================
// DISCORD BOT SETUP
// ============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const app = express();
app.use(express.json());

const dataManager = new DataManager();

// ============================================
// DISCORD COMMANDS
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    
    // !linkaccount command
    if (command === '!linkaccount') {
        // Check if already linked
        const existingAccount = dataManager.getAccount(message.author.id);
        if (existingAccount) {
            return message.reply('Your account is already linked! Use `!stats` to view your profile.');
        }
        
        // Check if banned
        const isBanned = await isUserBanned(message.guild, message.author.id);
        if (isBanned) {
            return message.reply('❌ You are currently banned from competitive play.');
        }
        
        // Generate temporary Photon name for linking
        const photonName = dataManager.createLinkingSession(message.author.id);
        
        try {
            const embed = new EmbedBuilder()
                .setTitle('🔗 Link Your Account')
                .setDescription('**Follow these steps to link your account:**')
                .addFields(
                    { name: '1️⃣ Change Your Photon Name', value: `In-game, temporarily change your Photon name to:\n\`\`\`${photonName}\`\`\``, inline: false },
                    { name: '2️⃣ Join Linking Room', value: 'Wait for an admin to create a linking room and join it', inline: false },
                    { name: '3️⃣ Get Linked', value: 'Admin will detect you and link your account automatically', inline: false },
                    { name: '4️⃣ Change Name Back', value: 'After linking, you can change your Photon name to anything!', inline: false },
                    { name: '⏱️ Expires In', value: '10 minutes', inline: true },
                    { name: '🆔 Your Temp Name', value: `\`${photonName}\``, inline: true }
                )
                .setColor(0x00AAFF)
                .setFooter({ text: 'Your account will be linked by PlayFab ID, so you can change your name anytime after linking!' })
                .setTimestamp();
            
            await message.author.send({ embeds: [embed] });
            message.reply('✅ Check your DMs for linking instructions!');
        } catch (error) {
            message.reply('❌ I couldn\'t DM you. Please enable DMs from server members.');
        }
    }
    
    // !stats command
    if (command === '!stats') {
        const targetUser = message.mentions.users.first() || message.author;
        const account = dataManager.getAccount(targetUser.id);
        
        if (!account) {
            return message.reply(targetUser.id === message.author.id 
                ? 'You haven\'t linked your account yet. Use `!linkaccount` to get started!'
                : 'That user hasn\'t linked their account.');
        }
        
        const rank = getRankFromMMR(account.mmr);
        const winRate = account.wins + account.losses > 0 
            ? ((account.wins / (account.wins + account.losses)) * 100).toFixed(1)
            : '0.0';
        
        const embed = new EmbedBuilder()
            .setTitle(`${rank.emoji} ${targetUser.username}'s Stats`)
            .addFields(
                { name: 'Rank', value: `${rank.emoji} ${rank.name}`, inline: true },
                { name: 'MMR', value: account.mmr.toString(), inline: true },
                { name: 'Win Rate', value: `${winRate}%`, inline: true },
                { name: 'Wins', value: account.wins.toString(), inline: true },
                { name: 'Losses', value: account.losses.toString(), inline: true },
                { name: 'Tags', value: account.tags.toString(), inline: true }
            )
            .setColor(rank.tier === 'high' ? 0xFF0000 : rank.tier === 'mid' ? 0xFFAA00 : 0x00AAFF)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }
    
    // !unlink command
    if (command === '!unlink') {
        const account = dataManager.getAccount(message.author.id);
        if (!account) {
            return message.reply('Your account isn\'t linked.');
        }
        
        delete dataManager.accounts[message.author.id];
        dataManager.saveData(dataManager.accountsFile, dataManager.accounts);
        
        message.reply('✅ Your account has been unlinked.');
    }
    
    // Admin commands
    if (command === '!mmr') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('You need administrator permissions.');
        }
        
        const targetUser = message.mentions.users.first();
        const mmrChange = parseInt(args[2]);
        
        if (!targetUser || isNaN(mmrChange)) {
            return message.reply('Usage: `!mmr @user <amount>`');
        }
        
        const account = dataManager.getAccount(targetUser.id);
        if (!account) {
            return message.reply('That user hasn\'t linked their account.');
        }
        
        const updatedAccount = dataManager.updateMMR(targetUser.id, mmrChange);
        const newRank = await updateUserRoles(message.guild, targetUser.id, updatedAccount.mmr);
        
        message.reply(`Updated ${targetUser.username}'s MMR by ${mmrChange}. New: ${updatedAccount.mmr} (${newRank.name})`);
        
        const trackingChannel = client.channels.cache.get(CONFIG.CHANNELS.MMR_TRACKING);
        if (trackingChannel) {
            trackingChannel.send(`<@${targetUser.id}> ${mmrChange > 0 ? '+' : ''}${mmrChange} MMR (Admin: ${message.author.tag})`);
        }
    }
    
    // !leaderboard command
    if (command === '!leaderboard' || command === '!lb') {
        const allAccounts = Object.entries(dataManager.accounts)
            .map(([discordId, data]) => ({ discordId, ...data }))
            .sort((a, b) => b.mmr - a.mmr)
            .slice(0, 10);
        
        if (allAccounts.length === 0) {
            return message.reply('No players ranked yet.');
        }
        
        const leaderboardText = allAccounts.map((account, index) => {
            const rank = getRankFromMMR(account.mmr);
            return `**${index + 1}.** <@${account.discordId}> - ${rank.emoji} ${account.mmr} MMR`;
        }).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Ranked Leaderboard')
            .setDescription(leaderboardText)
            .setColor(0xFFD700)
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }
});

// ============================================
// REPORT MONITORING
// ============================================
client.on('messageCreate', async (message) => {
    if (message.channelId !== CONFIG.CHANNELS.REPORTS) return;
    if (message.author.bot) return;
    
    if (message.content.includes(CONFIG.TARGET_PLAYFAB_ID) || 
        (message.embeds.length > 0 && message.embeds[0].description?.includes(CONFIG.TARGET_PLAYFAB_ID))) {
        
        const notificationChannel = client.channels.cache.get(CONFIG.CHANNELS.REPORT_NOTIFICATIONS);
        if (notificationChannel) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Report Detected')
                .setDescription(`A report was detected in <#${CONFIG.CHANNELS.REPORTS}>`)
                .addFields(
                    { name: 'PlayFab ID', value: CONFIG.TARGET_PLAYFAB_ID },
                    { name: 'Reporter', value: message.author.tag },
                    { name: 'Link', value: message.url }
                )
                .setColor(0xFF0000)
                .setTimestamp();
            
            await notificationChannel.send({ embeds: [embed] });
            
            const account = dataManager.getAccountByPhotonId(CONFIG.TARGET_PLAYFAB_ID);
            if (account) {
                dataManager.updateMMR(account.discordId, CONFIG.MMR_SETTINGS.REPORT_MMR_PENALTY);
                await updateUserRoles(message.guild, account.discordId, account.mmr);
                
                const trackingChannel = client.channels.cache.get(CONFIG.CHANNELS.MMR_TRACKING);
                if (trackingChannel) {
                    trackingChannel.send(`<@${account.discordId}> ${CONFIG.MMR_SETTINGS.REPORT_MMR_PENALTY} MMR (Report penalty)`);
                }
            }
        }
    }
});

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Check if user is banned
app.get('/api/account/ban-status', async (req, res) => {
    try {
        const { discordId } = req.query;
        
        const guilds = client.guilds.cache;
        for (const guild of guilds.values()) {
            const isBanned = await isUserBanned(guild, discordId);
            if (isBanned) {
                return res.json({ banned: true });
            }
        }
        
        res.json({ banned: false });
    } catch (error) {
        console.error('Error checking ban status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create room (admin only)
app.post('/api/room/create', async (req, res) => {
    try {
        const { code, tier } = req.body;
        
        dataManager.addRoomCode(code, tier.toLowerCase(), 'ADMIN');
        
        const codesChannel = client.channels.cache.get(CONFIG.CHANNELS.CODES);
        if (codesChannel) {
            const embed = new EmbedBuilder()
                .setTitle(`🎮 New ${tier} Rank Room`)
                .setDescription(`**Room Code:** \`${code}\``)
                .addFields(
                    { name: 'Tier', value: tier.toUpperCase(), inline: true },
                    { name: 'Created By', value: 'Admin', inline: true }
                )
                .setColor(tier === 'HIGH' ? 0xFF0000 : tier === 'MID' ? 0xFFAA00 : 0x00AAFF)
                .setTimestamp();
            
            await codesChannel.send({ embeds: [embed] });
        }
        
        res.json({ success: true, code });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Confirm account link (called by admin mod when player detected)
app.post('/api/account/confirm-link', async (req, res) => {
    try {
        const { temporaryPhotonName, playFabId } = req.body;
        
        const linkSession = dataManager.getLinkingSession(temporaryPhotonName);
        if (!linkSession) {
            return res.status(404).json({ error: 'Invalid or expired linking session' });
        }
        
        // Create account with PlayFab ID
        dataManager.createAccount(linkSession.discordId, playFabId, temporaryPhotonName);
        
        // Mark session as linked
        linkSession.linked = true;
        dataManager.saveData(dataManager.linkingFile, dataManager.linkingCodes);
        
        const guilds = client.guilds.cache;
        for (const guild of guilds.values()) {
            try {
                await updateUserRoles(guild, linkSession.discordId, CONFIG.MMR_SETTINGS.STARTING_MMR);
            } catch (error) {
                console.error('Error assigning role:', error);
            }
        }
        
        try {
            const user = await client.users.fetch(linkSession.discordId);
            const rank = getRankFromMMR(CONFIG.MMR_SETTINGS.STARTING_MMR);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Account Linked!')
                .setDescription('Your Discord account has been successfully linked!')
                .addFields(
                    { name: 'PlayFab ID', value: playFabId },
                    { name: 'Temporary Name Used', value: temporaryPhotonName },
                    { name: 'Starting Rank', value: `${rank.emoji} ${rank.name}` },
                    { name: 'Starting MMR', value: CONFIG.MMR_SETTINGS.STARTING_MMR.toString() },
                    { name: '✅ You Can Now', value: 'Change your Photon name to anything you want!' }
                )
                .setColor(0x00FF00)
                .setTimestamp();
            
            await user.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending DM:', error);
        }
        
        res.json({ 
            success: true, 
            playFabId: playFabId,
            discordId: linkSession.discordId
        });
    } catch (error) {
        console.error('Error confirming link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get account status by PlayFab ID
app.get('/api/account/status', (req, res) => {
    try {
        const { playFabId } = req.query;
        const account = dataManager.getAccountByPlayFabId(playFabId);
        
        if (account) {
            const rank = getRankFromMMR(account.mmr);
            res.json({
                linked: true,
                playFabId: account.playFabId,
                discordId: account.discordId,
                mmr: account.mmr,
                rank: rank.name,
                tier: rank.tier
            });
        } else {
            res.json({ linked: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Validate code and check rank access
app.post('/api/room/validate', (req, res) => {
    try {
        const { code, playFabId } = req.body;
        
        const account = dataManager.getAccountByPlayFabId(playFabId);
        if (!account) {
            return res.status(403).json({ error: 'Account not linked' });
        }
        
        // Determine tier from code prefix
        let tier = 'low';
        if (code.startsWith('MID')) tier = 'mid';
        if (code.startsWith('HIGH')) tier = 'high';
        
        const rank = getRankFromMMR(account.mmr);
        if (rank.tier !== tier) {
            return res.status(403).json({ 
                error: `You cannot access ${tier.toUpperCase()} tier rooms. Your rank: ${rank.name} (${rank.tier.toUpperCase()} tier)` 
            });
        }
        
        res.json({ valid: true, tier, rank: rank.name });
    } catch (error) {
        console.error('Error validating code:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all active codes
app.get('/api/room/codes', (req, res) => {
    try {
        const codes = dataManager.getAllActiveCodes();
        res.json({ codes });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get pending linking sessions (for admin mod)
app.get('/api/linking/pending', (req, res) => {
    try {
        const pending = dataManager.getAllPendingLinks();
        res.json({ sessions: pending });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update MMR (called by admin mod)
app.post('/api/mmr/update', async (req, res) => {
    try {
        const { playFabId, mmrChange, tags, survived } = req.body;
        
        const account = dataManager.getAccountByPlayFabId(playFabId);
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }
        
        const updatedAccount = dataManager.updateMMR(account.discordId, mmrChange, { tags, survived });
        
        const guilds = client.guilds.cache;
        for (const guild of guilds.values()) {
            await updateUserRoles(guild, account.discordId, updatedAccount.mmr);
        }
        
        const trackingChannel = client.channels.cache.get(CONFIG.CHANNELS.MMR_TRACKING);
        if (trackingChannel) {
            const rank = getRankFromMMR(updatedAccount.mmr);
            trackingChannel.send(
                `<@${account.discordId}> ${mmrChange > 0 ? '+' : ''}${mmrChange} MMR → ${updatedAccount.mmr} (${rank.emoji} ${rank.name})`
            );
        }
        
        res.json({ success: true, newMMR: updatedAccount.mmr });
    } catch (error) {
        console.error('Error updating MMR:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// START BOT
// ============================================
client.once('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    
    app.listen(CONFIG.API_PORT, () => {
        console.log(`✅ API server running on http://localhost:${CONFIG.API_PORT}`);
    });
});

client.login(CONFIG.DISCORD_TOKEN);
