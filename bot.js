require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType, PermissionFlagsBits } = require('discord.js');

// ── Config ────────────────────────────────────────────────────────────────────
const GUILD_ID         = '1474622050973782067';
const ANNOUNCE_CHANNEL = '1474625368060067880';
const MEMBER_ROLE_ID   = '1474624267118448640';

// Spam tracking
const messageCooldowns = new Map(); // userId -> [timestamps]
const SPAM_THRESHOLD   = 5;   // messages
const SPAM_WINDOW_MS   = 4000; // within 4 seconds

// Slurs/hate speech list — add/remove as needed
const BANNED_WORDS = [
  'nigger', 'nigga', 'faggot', 'retard', 'chink', 'spic', 'kike', 'tranny'
];

// Outside link pattern (allows discord.gg and your own site)
const LINK_REGEX     = /https?:\/\/[^\s]+/gi;
const ALLOWED_DOMAINS = ['discord.gg', 'discord.com', 'railway.app', 'github.com'];

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ── Register slash commands ───────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Post a mod update announcement (admin only)')
    .addStringOption(opt =>
      opt.setName('version').setDescription('Version number e.g. 1.3.0').setRequired(true))
    .addStringOption(opt =>
      opt.setName('notes').setDescription('What changed in this update').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user (mod only)')
    .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user (mod only)')
    .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user (mod only)')
    .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user (mod only)')
    .addUserOption(opt => opt.setName('user').setDescription('User to timeout').setRequired(true))
    .addIntegerOption(opt => opt.setName('minutes').setDescription('Duration in minutes').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages (mod only)')
    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to delete (max 100)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map(cmd => cmd.toJSON());

// Register commands on startup
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
}

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity("Freddy's Casting Mod: https://discord.gg/tCuRGHXEse", {
    type: ActivityType.Watching,
  });

  await registerCommands();
});

// ── Member join → give Member role ───────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  try {
    const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
    if (role) await member.roles.add(role);
    console.log(`✅ Gave Member role to ${member.user.tag}`);
  } catch (err) {
    console.error(`❌ Could not assign role to ${member.user.tag}:`, err);
  }
});

// ── Message moderation ────────────────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const member = message.member;
  const content = message.content;
  const lowerContent = content.toLowerCase();

  // Skip admins/mods from auto-mod
  if (member?.permissions.has(PermissionFlagsBits.KickMembers)) return;

  // 1. Hate speech / slurs
  const foundSlur = BANNED_WORDS.find(word => lowerContent.includes(word));
  if (foundSlur) {
    await message.delete().catch(() => {});
    return warnUser(message, 'Hate speech or slurs are not allowed here.');
  }

  // 2. Outside links
  const links = content.match(LINK_REGEX);
  if (links) {
    const hasBlockedLink = links.some(link => {
      return !ALLOWED_DOMAINS.some(domain => link.includes(domain));
    });
    if (hasBlockedLink) {
      await message.delete().catch(() => {});
      return warnUser(message, 'Outside links are not allowed. Ask a mod if you need to share something.');
    }
  }

  // 3. Spam detection
  const now = Date.now();
  const timestamps = messageCooldowns.get(message.author.id) || [];
  const recent = timestamps.filter(t => now - t < SPAM_WINDOW_MS);
  recent.push(now);
  messageCooldowns.set(message.author.id, recent);

  if (recent.length >= SPAM_THRESHOLD) {
    await message.delete().catch(() => {});
    messageCooldowns.delete(message.author.id);
    try {
      await member.timeout(5 * 60 * 1000, 'Spamming');
      await message.channel.send(`⚠️ <@${message.author.id}> has been timed out for 5 minutes for spamming.`);
    } catch (err) {
      console.error('Could not timeout spammer:', err);
    }
    return;
  }

  // 4. Excessive caps (>70% caps, message > 10 chars)
  if (content.length > 10) {
    const letters = content.replace(/[^a-zA-Z]/g, '');
    const caps = content.replace(/[^A-Z]/g, '');
    if (letters.length > 0 && caps.length / letters.length > 0.7) {
      await message.delete().catch(() => {});
      return warnUser(message, 'Please don\'t use excessive caps.');
    }
  }
});

// ── Helper: send a warning message ───────────────────────────────────────────
async function warnUser(message, reason) {
  try {
    const warning = await message.channel.send(
      `⚠️ <@${message.author.id}> — ${reason}`
    );
    setTimeout(() => warning.delete().catch(() => {}), 6000);
  } catch (err) {
    console.error('Could not send warning:', err);
  }
}

// ── Slash command handler ─────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // /update
  if (commandName === 'update') {
    const version = interaction.options.getString('version');
    const notes   = interaction.options.getString('notes');

    const embed = new EmbedBuilder()
      .setTitle(`🎉 FCM v${version} is out!`)
      .setDescription(notes)
      .setColor(0x00d98c)
      .addFields(
        { name: '📥 Download', value: 'Head to the downloads channel or the website to grab the latest version.' },
        { name: '🌐 Website', value: 'https://discord.gg/tCuRGHXEse' }
      )
      .setFooter({ text: "Freddy's Casting Mod" })
      .setTimestamp();

    try {
      const channel = await interaction.guild.channels.fetch(ANNOUNCE_CHANNEL);
      await channel.send({ content: '@everyone', embeds: [embed] });
      await interaction.reply({ content: `✅ Update v${version} posted!`, ephemeral: true });
    } catch (err) {
      console.error('Could not post update:', err);
      await interaction.reply({ content: '❌ Failed to post update.', ephemeral: true });
    }
  }

  // /warn
  if (commandName === 'warn') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');
    try {
      await target.send(`⚠️ You have been warned in **Freddy's Casting Mod** for: ${reason}`).catch(() => {});
      await interaction.reply({ content: `✅ Warned **${target.user.tag}** for: ${reason}` });
    } catch (err) {
      await interaction.reply({ content: '❌ Could not warn that user.', ephemeral: true });
    }
  }

  // /kick
  if (commandName === 'kick') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    try {
      await target.kick(reason);
      await interaction.reply({ content: `✅ Kicked **${target.user.tag}** — ${reason}` });
    } catch (err) {
      await interaction.reply({ content: '❌ Could not kick that user.', ephemeral: true });
    }
  }

  // /ban
  if (commandName === 'ban') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    try {
      await target.ban({ reason });
      await interaction.reply({ content: `✅ Banned **${target.user.tag}** — ${reason}` });
    } catch (err) {
      await interaction.reply({ content: '❌ Could not ban that user.', ephemeral: true });
    }
  }

  // /timeout
  if (commandName === 'timeout') {
    const target  = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason  = interaction.options.getString('reason') || 'No reason provided';
    try {
      await target.timeout(minutes * 60 * 1000, reason);
      await interaction.reply({ content: `✅ Timed out **${target.user.tag}** for ${minutes}m — ${reason}` });
    } catch (err) {
      await interaction.reply({ content: '❌ Could not timeout that user.', ephemeral: true });
    }
  }

  // /purge
  if (commandName === 'purge') {
    const amount = Math.min(interaction.options.getInteger('amount'), 100);
    try {
      await interaction.channel.bulkDelete(amount, true);
      const reply = await interaction.reply({ content: `✅ Deleted ${amount} messages.` });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 4000);
    } catch (err) {
      await interaction.reply({ content: '❌ Could not delete messages.', ephemeral: true });
    }
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
