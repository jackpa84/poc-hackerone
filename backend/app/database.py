import redis.asyncio as redis
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.config import settings
from app.models.user import User
from app.models.program import Program
from app.models.target import Target
from app.models.job import Job
from app.models.finding import Finding
from app.models.report import Report
from app.models.hackerone_log import HackerOneLog
from app.models.comment import Comment

redis_client: redis.Redis = None


async def init_db():
    global redis_client

    redis_client = redis.Redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )

    client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(
        database=client.bugbounty,
        document_models=[User, Program, Target, Job, Finding, Report, HackerOneLog, Comment],
    )
