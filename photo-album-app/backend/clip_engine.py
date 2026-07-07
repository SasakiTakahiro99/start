# -*- coding: utf-8 -*-
"""CLIP埋め込みエンジン(フォールバック付き)。

open_clip / torch が未インストール、またはモデルのロードに失敗した場合でも
ImportError を外に漏らさず「利用不可」として振る舞う。呼び出し側は
`is_available()` を見て、埋め込みが取れないときはメタ照合フォールバック
(基本設計10章)へ切り替える。
"""

import threading

import config

_lock = threading.Lock()
_state = {
    "tried": False,
    "available": False,
    "model": None,
    "preprocess": None,
    "tokenizer": None,
    "device": "cpu",
    "reason": "",
}


def _try_load() -> None:
    """初回呼び出し時に一度だけモデルロードを試みる。失敗しても例外を投げない。"""
    if _state["tried"]:
        return
    _state["tried"] = True

    if config.DISABLE_CLIP:
        _state["reason"] = "PHOTO_ALBUM_DISABLE_CLIP により無効化"
        return

    try:
        import torch
        import open_clip
    except Exception as exc:  # ImportError含む
        _state["reason"] = f"open_clip/torch 未インストール: {exc}"
        return

    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model, _, preprocess = open_clip.create_model_and_transforms(
            config.CLIP_MODEL_NAME, pretrained=config.CLIP_PRETRAINED
        )
        model.eval().to(device)
        tokenizer = open_clip.get_tokenizer(config.CLIP_MODEL_NAME)
        _state.update(
            model=model,
            preprocess=preprocess,
            tokenizer=tokenizer,
            device=device,
            available=True,
            reason="ok",
        )
    except Exception as exc:
        _state["reason"] = f"モデルロード失敗: {exc}"


def is_available() -> bool:
    with _lock:
        _try_load()
        return _state["available"]


def status() -> dict:
    with _lock:
        _try_load()
        return {
            "available": _state["available"],
            "model": config.CLIP_MODEL_NAME if _state["available"] else None,
            "reason": _state["reason"],
        }


def model_id() -> str:
    return config.CLIP_MODEL_NAME if is_available() else "none"


def embed_image(pil_image):
    """PIL画像 -> 正規化済み埋め込みベクトル(list[float])。利用不可ならNone。"""
    if not is_available():
        return None
    import torch

    with _lock:
        model = _state["model"]
        preprocess = _state["preprocess"]
        device = _state["device"]
    try:
        image = preprocess(pil_image.convert("RGB")).unsqueeze(0).to(device)
        with torch.no_grad():
            feat = model.encode_image(image)
            feat = feat / feat.norm(dim=-1, keepdim=True)
        return feat.squeeze(0).cpu().tolist()
    except Exception:
        return None


def embed_text(text: str):
    """テキスト -> 正規化済み埋め込みベクトル(list[float])。利用不可ならNone。"""
    if not is_available():
        return None
    import torch

    with _lock:
        model = _state["model"]
        tokenizer = _state["tokenizer"]
        device = _state["device"]
    try:
        tokens = tokenizer([text]).to(device)
        with torch.no_grad():
            feat = model.encode_text(tokens)
            feat = feat / feat.norm(dim=-1, keepdim=True)
        return feat.squeeze(0).cpu().tolist()
    except Exception:
        return None


def zero_shot_labels(pil_image, labels, top_k: int = 5):
    """画像に対し候補ラベル群とのゼロショット類似度を計算し上位を返す。

    Returns: [(label, score_float), ...]。利用不可なら空リスト。
    """
    if not is_available():
        return []
    import torch

    with _lock:
        model = _state["model"]
        preprocess = _state["preprocess"]
        tokenizer = _state["tokenizer"]
        device = _state["device"]
    try:
        image = preprocess(pil_image.convert("RGB")).unsqueeze(0).to(device)
        prompts = [f"{label}の写真" for label in labels]
        tokens = tokenizer(prompts).to(device)
        with torch.no_grad():
            img_feat = model.encode_image(image)
            img_feat = img_feat / img_feat.norm(dim=-1, keepdim=True)
            txt_feat = model.encode_text(tokens)
            txt_feat = txt_feat / txt_feat.norm(dim=-1, keepdim=True)
            sims = (img_feat @ txt_feat.T).squeeze(0)
        pairs = sorted(
            zip(labels, sims.cpu().tolist()), key=lambda p: p[1], reverse=True
        )
        return pairs[:top_k]
    except Exception:
        return []
