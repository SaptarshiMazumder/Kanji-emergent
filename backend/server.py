from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# WaniKani API configuration
WANIKANI_API_KEY = os.environ.get('WANIKANI_API_KEY', '')
WANIKANI_BASE_URL = "https://api.wanikani.com/v2"

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class KanjiReading(BaseModel):
    reading: str
    primary: bool
    type: str  # onyomi, kunyomi, nanori


class KanjiMeaning(BaseModel):
    meaning: str
    primary: bool


class ContextSentence(BaseModel):
    ja: str
    en: str


class VocabWord(BaseModel):
    id: int
    characters: str
    meanings: List[str]
    readings: List[str]


class RadicalComponent(BaseModel):
    id: int
    character: Optional[str] = None
    slug: str
    meaning: str


class KanjiSubject(BaseModel):
    id: int
    character: str
    meanings: List[KanjiMeaning]
    readings: List[KanjiReading]
    level: int
    meaning_mnemonic: Optional[str] = None
    reading_mnemonic: Optional[str] = None
    context_sentences: List[ContextSentence] = []
    vocabulary: List[VocabWord] = []
    radicals: List[RadicalComponent] = []
    jlpt_level: Optional[str] = None


class KanjiResponse(BaseModel):
    kanji: List[KanjiSubject]
    total_count: int
    page: int
    per_page: int
    total_pages: int


# JLPT level mapping (WaniKani levels to JLPT approximation)
# This is an approximation based on common mappings
JLPT_LEVEL_MAPPING = {
    "N5": list(range(1, 11)),      # Levels 1-10
    "N4": list(range(11, 21)),     # Levels 11-20
    "N3": list(range(21, 31)),     # Levels 21-30
    "N2": list(range(31, 51)),     # Levels 31-50
    "N1": list(range(51, 61)),     # Levels 51-60
}


def get_jlpt_level(wanikani_level: int) -> str:
    """Convert WaniKani level to approximate JLPT level"""
    for jlpt, levels in JLPT_LEVEL_MAPPING.items():
        if wanikani_level in levels:
            return jlpt
    return "N1"


# Routes
@api_router.get("/")
async def root():
    return {"message": "WaniKani Kanji Flashcards API"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


@api_router.get("/kanji", response_model=KanjiResponse)
async def get_kanji(
    jlpt_level: Optional[str] = Query(None, description="JLPT level (N5, N4, N3, N2, N1)"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page")
):
    """
    Fetch kanji from WaniKani API with optional JLPT level filtering and pagination.
    """
    if not WANIKANI_API_KEY:
        raise HTTPException(status_code=500, detail="WaniKani API key not configured")
    
    headers = {
        "Authorization": f"Bearer {WANIKANI_API_KEY}",
        "Wanikani-Revision": "20170710"
    }
    
    # Build levels parameter based on JLPT filter
    levels_param = ""
    if jlpt_level and jlpt_level.upper() in JLPT_LEVEL_MAPPING:
        levels = JLPT_LEVEL_MAPPING[jlpt_level.upper()]
        levels_param = f"&levels={','.join(map(str, levels))}"
    
    all_kanji_raw = []  # Store raw data with amalgamation IDs
    next_url = f"{WANIKANI_BASE_URL}/subjects?types=kanji{levels_param}"
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as http_client:
            # Fetch all kanji (WaniKani returns paginated results)
            while next_url:
                response = await http_client.get(next_url, headers=headers)
                
                if response.status_code != 200:
                    logger.error(f"WaniKani API error: {response.status_code} - {response.text}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"WaniKani API error: {response.text}"
                    )
                
                data = response.json()
                
                for item in data.get("data", []):
                    item_data = item.get("data", {})
                    all_kanji_raw.append({
                        "id": item.get("id", 0),
                        "data": item_data,
                        "amalgamation_ids": item_data.get("amalgamation_subject_ids", []),
                        "component_ids": item_data.get("component_subject_ids", [])
                    })
                
                # Check for next page
                next_url = data.get("pages", {}).get("next_url")
            
            # Apply pagination first to get the kanji we need
            total_count = len(all_kanji_raw)
            total_pages = (total_count + per_page - 1) // per_page
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            paginated_raw = all_kanji_raw[start_idx:end_idx]
            
            # Collect all vocabulary IDs we need to fetch (limit to 5 per kanji for performance)
            vocab_ids_to_fetch = set()
            radical_ids_to_fetch = set()
            for kanji_raw in paginated_raw:
                vocab_ids = kanji_raw["amalgamation_ids"][:5]  # Limit to 5 vocab per kanji
                vocab_ids_to_fetch.update(vocab_ids)
                radical_ids_to_fetch.update(kanji_raw["component_ids"])
            
            # Fetch vocabulary in batch if we have any
            vocab_map = {}
            if vocab_ids_to_fetch:
                vocab_ids_str = ",".join(map(str, vocab_ids_to_fetch))
                vocab_url = f"{WANIKANI_BASE_URL}/subjects?ids={vocab_ids_str}"
                vocab_response = await http_client.get(vocab_url, headers=headers)
                
                if vocab_response.status_code == 200:
                    vocab_data = vocab_response.json()
                    for v_item in vocab_data.get("data", []):
                        v_id = v_item.get("id")
                        v_data = v_item.get("data", {})
                        # Get all meanings, not just primary
                        all_meanings = [m.get("meaning", "") for m in v_data.get("meanings", []) if m.get("primary")]
                        if not all_meanings:
                            all_meanings = [m.get("meaning", "") for m in v_data.get("meanings", [])[:1]]
                        vocab_map[v_id] = VocabWord(
                            id=v_id,
                            characters=v_data.get("characters", ""),
                            meanings=all_meanings,
                            readings=[r.get("reading", "") for r in v_data.get("readings", []) if r.get("primary")]
                        )
            
            # Fetch radicals in batch if we have any
            radical_map = {}
            if radical_ids_to_fetch:
                radical_ids_str = ",".join(map(str, radical_ids_to_fetch))
                radical_url = f"{WANIKANI_BASE_URL}/subjects?ids={radical_ids_str}"
                radical_response = await http_client.get(radical_url, headers=headers)
                
                if radical_response.status_code == 200:
                    radical_data = radical_response.json()
                    for r_item in radical_data.get("data", []):
                        r_id = r_item.get("id")
                        r_data = r_item.get("data", {})
                        primary_meaning = next(
                            (m.get("meaning", "") for m in r_data.get("meanings", []) if m.get("primary")),
                            r_data.get("meanings", [{}])[0].get("meaning", "") if r_data.get("meanings") else ""
                        )
                        radical_map[r_id] = RadicalComponent(
                            id=r_id,
                            character=r_data.get("characters"),  # Can be None for image-only radicals
                            slug=r_data.get("slug", ""),
                            meaning=primary_meaning
                        )
            
            # Build final kanji objects with vocabulary
            paginated_kanji = []
            for kanji_raw in paginated_raw:
                item_data = kanji_raw["data"]
                
                # Extract meanings
                meanings = [
                    KanjiMeaning(
                        meaning=m.get("meaning", ""),
                        primary=m.get("primary", False)
                    )
                    for m in item_data.get("meanings", [])
                ]
                
                # Extract readings
                readings = [
                    KanjiReading(
                        reading=r.get("reading", ""),
                        primary=r.get("primary", False),
                        type=r.get("type", "onyomi")
                    )
                    for r in item_data.get("readings", [])
                ]
                
                wanikani_level = item_data.get("level", 1)
                
                # Extract context sentences
                context_sentences = [
                    ContextSentence(
                        ja=cs.get("ja", ""),
                        en=cs.get("en", "")
                    )
                    for cs in item_data.get("context_sentences", [])
                ]
                
                # Get vocabulary for this kanji
                vocab_list = []
                for v_id in kanji_raw["amalgamation_ids"][:5]:
                    if v_id in vocab_map:
                        vocab_list.append(vocab_map[v_id])
                
                kanji_subject = KanjiSubject(
                    id=kanji_raw["id"],
                    character=item_data.get("characters", ""),
                    meanings=meanings,
                    readings=readings,
                    level=wanikani_level,
                    meaning_mnemonic=item_data.get("meaning_mnemonic", ""),
                    reading_mnemonic=item_data.get("reading_mnemonic", ""),
                    context_sentences=context_sentences,
                    vocabulary=vocab_list,
                    jlpt_level=get_jlpt_level(wanikani_level)
                )
                paginated_kanji.append(kanji_subject)
        
        return KanjiResponse(
            kanji=paginated_kanji,
            total_count=total_count,
            page=page,
            per_page=per_page,
            total_pages=total_pages
        )
        
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request to WaniKani API timed out")
    except httpx.RequestError as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error connecting to WaniKani API: {str(e)}")


@api_router.get("/kanji/{kanji_id}")
async def get_kanji_by_id(kanji_id: int):
    """
    Fetch a specific kanji by its ID from WaniKani API.
    """
    if not WANIKANI_API_KEY:
        raise HTTPException(status_code=500, detail="WaniKani API key not configured")
    
    headers = {
        "Authorization": f"Bearer {WANIKANI_API_KEY}",
        "Wanikani-Revision": "20170710"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.get(
                f"{WANIKANI_BASE_URL}/subjects/{kanji_id}",
                headers=headers
            )
            
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Kanji not found")
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"WaniKani API error: {response.text}"
                )
            
            item = response.json()
            item_data = item.get("data", {})
            
            meanings = [
                KanjiMeaning(
                    meaning=m.get("meaning", ""),
                    primary=m.get("primary", False)
                )
                for m in item_data.get("meanings", [])
            ]
            
            readings = [
                KanjiReading(
                    reading=r.get("reading", ""),
                    primary=r.get("primary", False),
                    type=r.get("type", "onyomi")
                )
                for r in item_data.get("readings", [])
            ]
            
            wanikani_level = item_data.get("level", 1)
            
            # Extract context sentences
            context_sentences = [
                ContextSentence(
                    ja=cs.get("ja", ""),
                    en=cs.get("en", "")
                )
                for cs in item_data.get("context_sentences", [])
            ]
            
            return KanjiSubject(
                id=item.get("id", 0),
                character=item_data.get("characters", ""),
                meanings=meanings,
                readings=readings,
                level=wanikani_level,
                meaning_mnemonic=item_data.get("meaning_mnemonic", ""),
                reading_mnemonic=item_data.get("reading_mnemonic", ""),
                context_sentences=context_sentences,
                jlpt_level=get_jlpt_level(wanikani_level)
            )
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request to WaniKani API timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Error connecting to WaniKani API: {str(e)}")


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
