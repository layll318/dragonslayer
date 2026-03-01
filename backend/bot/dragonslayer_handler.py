# -*- coding: utf-8 -*-
"""
DragonSlayer TWA Handler

Provides the /dragon command to launch the DragonSlayer clicker game
as a Telegram Mini App.

Usage:
  /dragon  — Launch the game
"""

import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ContextTypes, CommandHandler

logger = logging.getLogger(__name__)

TWA_BASE_URL = "https://dragonslayer-production.up.railway.app"
TWA_GAME_PATH = "/twa"


class DragonSlayerTWAHandler:
    def __init__(self):
        self.twa_url = f"{TWA_BASE_URL}{TWA_GAME_PATH}"
        logger.info(f"✅ DragonSlayerTWAHandler initialized: {self.twa_url}")

    async def dragon_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user = update.effective_user
        chat_type = update.effective_chat.type if update.effective_chat else "private"
        is_group = chat_type in ["group", "supergroup"]

        logger.info(
            f"[DRAGON_TWA] User {user.id} (@{user.username}) in {chat_type}"
        )

        if is_group:
            bot_username = (await context.bot.get_me()).username
            keyboard = [
                [InlineKeyboardButton(
                    text="⚔️ Play in DM",
                    url=f"https://t.me/{bot_username}?start=play_dragon",
                )],
                [InlineKeyboardButton(
                    text="🌐 Play on Website",
                    url=TWA_BASE_URL,
                )],
            ]
            text = (
                "⚔️ <b>DragonSlayer</b> ⚔️\n\n"
                "Tap to earn gold, raise your hero, and slay dragons!\n\n"
                "🪙 Earn gold by tapping\n"
                "🏰 Build passive income\n"
                "🔥 Combo multipliers & critical hits\n"
                "🐉 Dragon boss raids every 3 minutes\n\n"
                "👆 <b>Open in DM to play!</b>"
            )
        else:
            keyboard = [
                [InlineKeyboardButton(
                    text="⚔️ Play DragonSlayer",
                    web_app=WebAppInfo(url=self.twa_url),
                )],
                [InlineKeyboardButton(
                    text="🌐 Play on Website",
                    url=TWA_BASE_URL,
                )],
            ]
            text = (
                "⚔️ <b>DragonSlayer</b> ⚔️\n\n"
                "Your hero awaits — tap, build, and conquer!\n\n"
                "🪙 Tap to earn gold\n"
                "🏰 Buy buildings for passive income\n"
                "🔥 Build combos for big multipliers\n"
                "⚡ Critical hits for 5× gold\n"
                "🐉 Slay dragon bosses for huge rewards\n"
                "📜 Daily quests & login bonuses\n\n"
                "👆 <b>Tap below to launch!</b>"
            )

        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_html(text, reply_markup=reply_markup)

    async def start_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start play_dragon deep link from groups."""
        args = context.args or []
        if args and args[0] == "play_dragon":
            await self.dragon_command(update, context)

    def get_handlers(self):
        return [
            CommandHandler("dragon", self.dragon_command),
            CommandHandler("dragonslayer", self.dragon_command),
        ]
