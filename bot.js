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
    
    // NEW: Create linking session that players join in-game
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
}

const dataManager = new DataManager();

// ============================================
// HELPER FUNCTIONS
// ============================================
function getRankFromMMR(mmr) {
    for (const [key, config] of Object.entries(CONFIG.RANK_CONFIG)) {
        if (mmr >= config.mmrRange[0] && mmr <= config.mmrRange[1]) {
            return config;
        }
    }
    return CONFIG.RANK_CONFIG.BRONZE;
}

function getTierFromRoles(member) {
    // Check roles from highest to lowest tier
    if (member.roles.cache.has(CONFIG.ROLES.RUBY) || member.roles.cache.has(CONFIG.ROLES.SAPPHIRE)) {
        return 'high';
    }
    if (member.roles.cache.has(CONFIG.ROLES.DIAMOND) || member.roles.cache.has(CONFIG.ROLES.GOLD)) {
        return 'mid';
    }
    if (member.roles.cache.has(CONFIG.ROLES.SILVER) || member.roles.cache.has(CONFIG.ROLES.BRONZE)) {
        return 'low';
    }
    return null;
}

async function isUserBanned(guild, userId) {
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return false;
        return member.roles.cache.has(CONFIG.ROLES.COMP_BANNED);
    } catch (error) {
        return false;
    }
}

async function updateUserRoles(guild, userId, mmr) {
    try {
        const member = await guild.members.fetch(userId);
        const newRank = getRankFromMMR(mmr);
        
        // Remove all rank roles
        const rankRoles = Object.values(CONFIG.ROLES).filter(r => r !== CONFIG.ROLES.COMP_BANNED);
        for (const roleId of rankRoles) {
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
            }
        }
        
        // Add new rank role
        await member.roles.add(newRank.roleId);
    } catch (error) {
        console.error('Error updating roles:', error);
    }
}

// ============================================
// DISCORD BOT
// ============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// ============================================
// DISCORD COMMANDS
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    // !linkaccount - Generate linking code
    if (content === '!linkaccount') {
        try {
            const guilds = client.guilds.cache;
            let isBanned = false;
            
            for (const guild of guilds.values()) {
                if (await isUserBanned(guild, message.author.id)) {
                    isBanned = true;
                    break;
                }
            }
            
            if (isBanned) {
                return message.reply('You are currently banned from competitive play.');
            }
            
            const existingAccount = dataManager.getAccount(message.author.id);
            if (existingAccount) {
                return message.reply('Your account is already linked! Use `!unlink` if you want to link a different account.');
            }
            
            // Generate 5-digit Photon name
            const photonName = dataManager.createLinkingSession(message.author.id);
            
            const dmEmbed = new EmbedBuilder()
                .setTitle('🔗 Account Linking Instructions')
                .setDescription('Follow these steps to link your account:')
                .addFields(
                    { 
                        name: '1️⃣ Join the Linking Room', 
                        value: 'Join room code: **LINK**' 
                    },
                    { 
                        name: '2️⃣ Change Your Photon Name', 
                        value: `Set your Photon name to: **${photonName}**` 
                    },
                    { 
                        name: '3️⃣ Wait for Admin', 
                        value: 'An admin will detect you and complete the linking process' 
                    },
                    { 
                        name: '✅ After Linking', 
                        value: 'You can change your Photon name back to anything you want!' 
                    },
                    { 
                        name: '⏰ Code Expires', 
                        value: 'This code expires in 10 minutes' 
                    }
                )
                .setColor(0x00AAFF)
                .setFooter({ text: 'Your account will be linked by PlayFab ID, so you can use any name after linking!' })
                .setTimestamp();
            
            await message.author.send({ embeds: [dmEmbed] });
            await message.reply('Check your DMs for linking instructions!');
            
        } catch (error) {
            console.error('Error in !linkaccount:', error);
            message.reply('Failed to generate linking code. Make sure I can DM you!');
        }
    }
    
    // !rankedcode - Get room code based on roles (no mod required)
    if (content === '!rankedcode') {
        try {
            const guilds = client.guilds.cache;
            let isBanned = false;
            let member = null;
            
            // Check ban status and get member
            for (const guild of guilds.values()) {
                if (await isUserBanned(guild, message.author.id)) {
                    isBanned = true;
                    break;
                }
                if (!member) {
                    member = await guild.members.fetch(message.author.id).catch(() => null);
                }
            }
            
            if (isBanned) {
                return message.reply('You are currently banned from competitive play.');
            }
            
            if (!member) {
                return message.reply('Could not find your server membership.');
            }
            
            // Determine tier from roles
            const tier = getTierFromRoles(member);
            
            if (!tier) {
                return message.reply('You don\'t have a rank role! Use `!linkaccount` to get started.');
            }
            
            // Get active codes for this tier
            const codes = dataManager.getRoomCodesByTier(tier);
            
            if (codes.length === 0) {
                return message.reply(`No active ${tier.toUpperCase()} tier rooms available right now. Please wait for an admin to create one!`);
            }
            
            // Get the most recent code
            const latestCode = codes[codes.length - 1];
            
            const dmEmbed = new EmbedBuilder()
                .setTitle(`🎮 ${tier.toUpperCase()} Tier Room Code`)
                .setDescription(`Here's your room code:`)
                .addFields(
                    { 
                        name: '🔑 Room Code', 
                        value: `**${latestCode.code}**`,
                        inline: true
                    },
                    { 
                        name: '🎯 Tier', 
                        value: tier.toUpperCase(),
                        inline: true
                    },
                    { 
                        name: '⏰ Created', 
                        value: `<t:${Math.floor(latestCode.createdAt / 1000)}:R>`,
                        inline: true
                    },
                    {
                        name: 'ℹ️ How to Join',
                        value: 'Enter this code in Gorilla Tag to join the room!'
                    }
                )
                .setColor(tier === 'high' ? 0xFF0000 : tier === 'mid' ? 0xFFAA00 : 0x00AAFF)
                .setTimestamp();
            
            await message.author.send({ embeds: [dmEmbed] });
            await message.reply('Check your DMs for the room code!');
            
        } catch (error) {
            console.error('Error in !rankedcode:', error);
            message.reply('Failed to get room code. Make sure I can DM you!');
        }
    }
    
    // !stats - Show stats
    if (content.startsWith('!stats')) {
        try {
            let targetUser = message.author;
            
            if (message.mentions.users.size > 0) {
                targetUser = message.mentions.users.first();
            }
            
            const account = dataManager.getAccount(targetUser.id);
            
            if (!account) {
                return message.reply(targetUser.id === message.author.id ? 
                    'You haven\'t linked your account yet! Use `!linkaccount` to get started.' :
                    'This user hasn\'t linked their account yet.'
                );
            }
            
            const rank = getRankFromMMR(account.mmr);
            const winRate = account.wins + account.losses > 0 ? 
                ((account.wins / (account.wins + account.losses)) * 100).toFixed(1) : 0;
            
            const embed = new EmbedBuilder()
                .setTitle(`${rank.emoji} ${targetUser.username}'s Stats`)
                .addFields(
                    { name: 'Rank', value: rank.name, inline: true },
                    { name: 'MMR', value: account.mmr.toString(), inline: true },
                    { name: 'Tier', value: rank.tier.toUpperCase(), inline: true },
                    { name: 'Wins', value: account.wins.toString(), inline: true },
                    { name: 'Losses', value: account.losses.toString(), inline: true },
                    { name: 'Win Rate', value: `${winRate}%`, inline: true },
                    { name: 'Total Tags', value: account.tags.toString(), inline: true },
                    { name: 'Times Survived', value: account.timesSurvived.toString(), inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in !stats:', error);
            message.reply('Failed to fetch stats.');
        }
    }
    
    // !unlink - Unlink account
    if (content === '!unlink') {
        const account = dataManager.getAccount(message.author.id);
        if (!account) {
            return message.reply('Your account is not linked.');
        }
        
        delete dataManager.accounts[message.author.id];
        dataManager.saveData(dataManager.accountsFile, dataManager.accounts);
        
        message.reply('Your account has been unlinked. You can now use `!linkaccount` to link a different account.');
    }
    
    // !leaderboard or !lb - Show top 10 players
    if (content === '!leaderboard' || content === '!lb') {
        try {
            const sortedAccounts = Object.entries(dataManager.accounts)
                .map(([discordId, data]) => ({ discordId, ...data }))
                .sort((a, b) => b.mmr - a.mmr)
                .slice(0, 10);
            
            if (sortedAccounts.length === 0) {
                return message.reply('No players have linked their accounts yet!');
            }
            
            const leaderboardText = await Promise.all(
                sortedAccounts.map(async (account, index) => {
                    try {
                        const user = await client.users.fetch(account.discordId);
                        const rank = getRankFromMMR(account.mmr);
                        return `${index + 1}. ${rank.emoji} **${user.username}** - ${account.mmr} MMR`;
                    } catch {
                        return `${index + 1}. Unknown User - ${account.mmr} MMR`;
                    }
                })
            );
            
            const embed = new EmbedBuilder()
                .setTitle('🏆 Top 10 Leaderboard')
                .setDescription(leaderboardText.join('\n'))
                .setColor(0xFFD700)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in !leaderboard:', error);
            message.reply('Failed to fetch leaderboard.');
        }
    }
    
    // !mmr @user <amount> - Admin only MMR adjustment
    if (content.startsWith('!mmr')) {
        try {
            const member = message.guild.members.cache.get(message.author.id);
            if (!member || !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply('You need administrator permissions to use this command.');
            }
            
            if (message.mentions.users.size === 0) {
                return message.reply('Please mention a user: `!mmr @user <amount>`');
            }
            
            const targetUser = message.mentions.users.first();
            const args = message.content.split(' ');
            const mmrChange = parseInt(args[2]);
            
            if (isNaN(mmrChange)) {
                return message.reply('Please provide a valid MMR amount: `!mmr @user <amount>`');
            }
            
            const account = dataManager.getAccount(targetUser.id);
            if (!account) {
                return message.reply('This user hasn\'t linked their account yet.');
            }
            
            const updatedAccount = dataManager.updateMMR(targetUser.id, mmrChange);
            await updateUserRoles(message.guild, targetUser.id, updatedAccount.mmr);
            
            const rank = getRankFromMMR(updatedAccount.mmr);
            message.reply(`Updated ${targetUser.username}'s MMR: ${mmrChange > 0 ? '+' : ''}${mmrChange} → ${updatedAccount.mmr} (${rank.emoji} ${rank.name})`);
            
        } catch (error) {
            console.error('Error in !mmr:', error);
            message.reply('Failed to update MMR.');
        }
    }
});

// ============================================
// EXPRESS API SERVER
// ============================================
const app = express();
app.use(express.json());

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
                    { name: 'Created By', value: 'Admin', inline: true },
                    { name: 'How to Join', value: 'Type `!rankedcode` in Discord or use the mod', inline: false }
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

// Confirm account link (called by admin mod when player detected in LINK room)
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
                    { name: '✅ You Can Now', value: 'Change your Photon name to anything you want!\nUse `!rankedcode` to get room codes without needing the mod!' }
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

// Get pending linking sessions (for admin mod to detect players)
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
