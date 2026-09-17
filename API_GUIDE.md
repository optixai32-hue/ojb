# Guide complet — API VibesAI

Base URL : `https://nelcia2.space-z.ai`

Toutes les routes sont sous `/api/vibes/*`. Aucune authentification requise côté client — le cookie `VIBES_META_SESSION` est configuré côté serveur.

## Sommaire

1. [Générer une image](#1-générer-une-image)
2. [Générer une vidéo](#2-générer-une-vidéo)
3. [Éditer une image](#3-éditer-une-image)
4. [Animer une image (Image to Video)](#4-animer-une-image)
5. [Start/End Frame Video](#5-startend-frame-video)
6. [Upload + Edit](#6-upload--edit)
7. [Text to Speech (TTS)](#7-text-to-speech)
8. [Télécharger un média](#8-télécharger-un-média)
9. [Retirer le watermark Meta AI](#9-retirer-le-watermark)
10. [Exemples JavaScript / Python / cURL](#10-exemples)

---

## 1. Générer une image

**Synchrone** — l'image est retournée immédiatement, pas de polling.

```http
POST /api/vibes/images/generate
Content-Type: application/json

{
  "project_id": "<project-id>",
  "prompt": "a serene mountain lake at sunrise",
  "aspect_ratio": "16:9",
  "variations": 1
}
```

**Réponse :**
```json
{
  "success": true,
  "data": [
    {
      "imageEntId": "1359952223863559",
      "url": "https://scontent-sin6-2.xx.fbcdn.net/...",
      "prompt": "a serene mountain lake at sunrise"
    }
  ]
}
```

**Aspect ratios :** `16:9` (landscape), `9:16` (portrait), `1:1` (square)
**Variations :** 1 à 4

---

## 2. Générer une vidéo

**Asynchrone** — retourne un batchId, puis polling jusqu'à completion.

### Étape 1 : Soumettre

```http
POST /api/vibes/videos/generate
Content-Type: application/json

{
  "project_id": "<project-id>",
  "prompt": "a majestic eagle flying over mountains",
  "aspect_ratio": "16:9",
  "resolution": "480p",
  "variations": 1,
  "poll": false
}
```

**Réponse :**
```json
{
  "batchId": "batch-01a0b117-d9a2-7b50-9939-0335d51b0a0f",
  "needsPolling": true,
  "items": [{ "id": "...", "isLoading": true }]
}
```

### Étape 2 : Polling

```http
POST /api/vibes/batches/{batchId}/poll?timeout=180
```

**Réponse quand complète :**
```json
{
  "id": "batch-...",
  "isComplete": true,
  "content": [
    {
      "id": "batch-...-content-0",
      "videoUrl": "https://video-sin2-1.xx.fbcdn.net/...",
      "imageUrl": "https://scontent-.../...",
      "prompt": "a majestic eagle..."
    }
  ]
}
```

### Étape 3 : Télécharger

```http
GET /api/vibes/media/{contentId}/download?type=video
```

---

## 3. Éditer une image

```http
POST /api/vibes/images/edit
Content-Type: application/json

{
  "source_image_ent_id": "1359952223863559",
  "edit_prompt": "make it look like a watercolor painting",
  "project_id": "<project-id>"
}
```

**Réponse :**
```json
{
  "success": true,
  "contentItem": {
    "id": "...",
    "imageUrl": "https://scontent-...",
    "imagePrompt": "make it look like a watercolor painting"
  }
}
```

> ⚠️ Le `source_image_ent_id` doit provenir d'une image **générée** (étape 1) ou d'une image **uploadée et enregistrée** (étape 6).

---

## 4. Animer une image

Transforme une image fixe en vidéo (~5s). Deux modes : auto (sans prompt) ou manual (avec directive).

### Avec une image de la bibliothèque (batch_id) :

```http
POST /api/vibes/videos/animate
Content-Type: application/json

{
  "project_id": "<project-id>",
  "batch_id": "batch-01a0b0f2-...",
  "content_id": "batch-...-content-0",
  "prompt": "camera slowly zooms in",
  "poll": false
}
```

### Avec une image uploadée (source_image direct) :

```http
POST /api/vibes/videos/animate
Content-Type: application/json

{
  "project_id": "<project-id>",
  "source_image": {
    "id": "<contentItemId from upload>",
    "imageUrl": "https://scontent-...",
    "mediaEntId": "13599...",
    "prompt": "uploaded image"
  },
  "prompt": "gentle flowing motion",
  "poll": false
}
```

**Réponse :**
```json
{
  "batchId": "image2video-1789676936108-7b835adc",
  "needsPolling": true
}
```

Puis poll comme pour la génération vidéo (étape 2 ci-dessus).

---

## 5. Start/End Frame Video

Interpole entre deux images clés.

```http
POST /api/vibes/videos/generate
Content-Type: application/json

{
  "project_id": "<project-id>",
  "prompt": "the rose slowly wilts, time-lapse",
  "aspect_ratio": "16:9",
  "resolution": "480p",
  "variations": 1,
  "start_frame": {
    "oil_handle": "<mediaEntId>",
    "image_url": "https://...",
    "image_ent_id": "<mediaEntId>",
    "source": "upload"
  },
  "end_frame": {
    "oil_handle": "<mediaEntId>",
    "image_url": "https://...",
    "image_ent_id": "<mediaEntId>",
    "source": "upload"
  },
  "poll": false
}
```

---

## 6. Upload + Edit

### Étape 1 : Upload (multipart)

```http
POST /api/vibes/upload/media
Content-Type: multipart/form-data

file: <binary file>
filename: my-image.png
project_id: <project-id>
```

**Réponse :**
```json
{
  "mediaEntId": "13599...",
  "imageUrl": "https://scontent-...",
  "uploadToken": "dc065...|13599...|...",
  "contentItemId": "-SIzbocuErLntrpQJWTUc",
  "sourceImageEntId": "13599...",
  "registered": true
}
```

### Étape 2 : Edit avec le mediaEntId

```http
POST /api/vibes/images/edit
Content-Type: application/json

{
  "source_image_ent_id": "<mediaEntId from upload>",
  "edit_prompt": "make it night time",
  "project_id": "<project-id>"
}
```

---

## 7. Text to Speech

### Lister les voix

```http
GET /api/vibes/voices
```

### Synthétiser

```http
POST /api/vibes/tts
Content-Type: application/json

{
  "text": "Hello world, this is a test.",
  "voice": "play_ai_Marisol",
  "output_format": "mp3"
}
```

**Réponse :**
```json
{
  "audioBase64": "SUQzBAAAAA...",
  "contentType": "audio/mpeg"
}
```

---

## 8. Télécharger un média

```http
GET /api/vibes/media/{contentId}/download?type=video
GET /api/vibes/media/{contentId}/download?type=image&clean=true
```

- `type=video` → retourne un MP4 binaire (`Content-Type: video/mp4`)
- `type=image` → retourne un PNG binaire (`Content-Type: image/png`)
- `clean=true` → retire le watermark Meta AI avant de retourner l'image

---

## 9. Retirer le watermark

```http
POST /api/vibes/watermark/clean
Content-Type: application/json

{
  "image_url": "https://scontent-..."
}
```

Retourne un PNG binaire sans le watermark Meta AI (coin bas-droit).

---

## 10. Exemples

### JavaScript (fetch)

```javascript
const BASE = 'https://nelcia2.space-z.ai'

// 1. Create project
const proj = await fetch(`${BASE}/api/vibes/projects`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'My Project' }),
}).then(r => r.json())

// 2. Generate image
const img = await fetch(`${BASE}/api/vibes/images/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: proj.id,
    prompt: 'a cat in a garden',
    aspect_ratio: '1:1',
  }),
}).then(r => r.json())

console.log('Image URL:', img.data[0].url)

// 3. Generate video (async)
const video = await fetch(`${BASE}/api/vibes/videos/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: proj.id,
    prompt: 'sunset over ocean',
    aspect_ratio: '16:9',
    poll: false,
  }),
}).then(r => r.json())

// 4. Poll until complete
const batch = await fetch(`${BASE}/api/vibes/batches/${video.batchId}/poll?timeout=180`, {
  method: 'POST',
}).then(r => r.json())

console.log('Video URL:', batch.content[0].videoUrl)

// 5. Download
const downloadUrl = `${BASE}/api/vibes/media/${batch.content[0].id}/download?type=video`
```

### Python (requests)

```python
import requests

BASE = 'https://nelcia2.space-z.ai'

# 1. Create project
proj = requests.post(f'{BASE}/api/vibes/projects',
    json={'name': 'My Project'}).json()

# 2. Generate image
img = requests.post(f'{BASE}/api/vibes/images/generate',
    json={
        'project_id': proj['id'],
        'prompt': 'a cat in a garden',
        'aspect_ratio': '1:1',
    }).json()
print('Image:', img['data'][0]['url'])

# 3. Generate video (async)
video = requests.post(f'{BASE}/api/vibes/videos/generate',
    json={
        'project_id': proj['id'],
        'prompt': 'sunset over ocean',
        'aspect_ratio': '16:9',
        'poll': False,
    }).json()

# 4. Poll until complete
batch = requests.post(f'{BASE}/api/vibes/batches/{video["batchId"]}/poll?timeout=180').json()
print('Video:', batch['content'][0]['videoUrl'])

# 5. Download
download_url = f'{BASE}/api/vibes/media/{batch["content"][0]["id"]}/download?type=video'
video_bytes = requests.get(download_url).content
with open('video.mp4', 'wb') as f:
    f.write(video_bytes)
```

### cURL

```bash
# Create project
PROJECT_ID=$(curl -s -X POST https://nelcia2.space-z.ai/api/vibes/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Generate image
curl -s -X POST https://nelcia2.space-z.ai/api/vibes/images/generate \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"prompt\": \"a cat\", \"aspect_ratio\": \"1:1\"}"

# Generate video
BATCH_ID=$(curl -s -X POST https://nelcia2.space-z.ai/api/vibes/videos/generate \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"prompt\": \"sunset\", \"poll\": false}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['batchId'])")

# Poll for completion
curl -s -X POST "https://nelcia2.space-z.ai/api/vibes/batches/$BATCH_ID/poll?timeout=180"

# Download video
curl -o video.mp4 "https://nelcia2.space-z.ai/api/vibes/media/$CONTENT_ID/download?type=video"
```

---

## Résumé des endpoints de génération

| Fonctionnalité | Endpoint | Type | Durée |
|---|---|---|---|
| Generate image | `POST /api/vibes/images/generate` | Synchrone | ~10-15s |
| Generate video | `POST /api/vibes/videos/generate` | Asynchrone (poll) | ~30-90s |
| Edit image | `POST /api/vibes/images/edit` | Synchrone | ~10-15s |
| Animate image | `POST /api/vibes/videos/animate` | Asynchrone (poll) | ~30-90s |
| Start/End frame | `POST /api/vibes/videos/generate` (avec start_frame) | Asynchrone (poll) | ~30-90s |
| Upload image | `POST /api/vibes/upload/media` | Synchrone | ~5s |
| TTS | `POST /api/vibes/tts` | Synchrone | ~2-5s |
| Watermark removal | `POST /api/vibes/watermark/clean` | Synchrone | ~0.5s |
