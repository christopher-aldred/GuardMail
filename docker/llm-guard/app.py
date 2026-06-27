"""
Guardmail LLM Guard Service

A FastAPI service that wraps llm-guard to scan email content
for prompt injection and other LLM vulnerabilities.
"""

import os
import logging
import dataclasses

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from llm_guard import scan_prompt
from llm_guard.input_scanners import PromptInjection, Toxicity, Anonymize
from llm_guard.input_scanners.toxicity import DEFAULT_MODEL as TOXICITY_DEFAULT_MODEL
try:
    from llm_guard.input_scanners.jailbreak import JailbreakDetection
except ImportError:
    JailbreakDetection = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Guardmail LLM Guard Service", version="1.0.0")

_vault_path = os.getenv("LLM_GUARD_VAULT_PATH", None)

# ONNX Runtime inference is significantly faster than the default PyTorch
# backend for the small transformer classifiers used by these scanners
# (typically ~1.5-2x lower per-scan latency, lower memory, faster cold start).
# Can be disabled by setting LLM_GUARD_USE_ONNX=0 (e.g. for debugging).
_use_onnx = os.getenv("LLM_GUARD_USE_ONNX", "1").strip().lower() not in ("0", "false", "no")
logger.info(f"ONNX inference enabled: {_use_onnx}")

_scanners = [
    PromptInjection(
        threshold=float(os.getenv("LLM_GUARD_INJECTION_THRESHOLD", "0.8")),
        use_onnx=_use_onnx,
    ),
]
if JailbreakDetection:
    _scanners.append(
        JailbreakDetection(
            threshold=float(os.getenv("LLM_GUARD_JAILBREAK_THRESHOLD", "0.8")),
            use_onnx=_use_onnx,
        )
    )
# The Toxicity ONNX repo (ProtectAI/unbiased-toxic-roberta-onnx) ships both
# model.onnx and model_quantized.onnx. optimum warns about the ambiguity and
# defaults to model.onnx; explicitly select the quantized file for a smaller,
# faster model with negligible accuracy loss. The other scanners' repos only
# contain model.onnx, so they are left on the default.
_toxicity_model = dataclasses.replace(
    TOXICITY_DEFAULT_MODEL, onnx_filename="model_quantized.onnx"
)
_scanners.append(
    Toxicity(
        model=_toxicity_model,
        threshold=float(os.getenv("LLM_GUARD_TOXICITY_THRESHOLD", "0.8")),
        use_onnx=_use_onnx,
    )
)

if _vault_path:
    _scanners.insert(0, Anonymize(vault=_vault_path, use_onnx=_use_onnx))


class ScanRequest(BaseModel):
    text: str = Field(..., description="The text content to scan")
    fail_fast: bool = Field(default=False)


class ScanResponse(BaseModel):
    sanitized_text: str
    is_valid: bool
    results: dict
    risk_scores: dict
    scanners_used: list


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "llm-guard"}


@app.post("/scan/prompt", response_model=ScanResponse)
async def scan_prompt_endpoint(request: ScanRequest):
    try:
        logger.info(f"Scanning text of length {len(request.text)}")
        sanitized_text, results, risk_scores = scan_prompt(
            scanners=_scanners, prompt=request.text, fail_fast=request.fail_fast
        )
        is_valid = all(results.values())
        scanner_names = [type(s).__name__ for s in _scanners]
        logger.info(f"Scan complete. Valid: {is_valid}")
        return ScanResponse(
            sanitized_text=sanitized_text,
            is_valid=is_valid,
            results=results,
            risk_scores=risk_scores,
            scanners_used=scanner_names,
        )
    except Exception as e:
        logger.error(f"Scan failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")


@app.post("/scan/attachment", response_model=ScanResponse)
async def scan_attachment_endpoint(request: ScanRequest):
    try:
        logger.info(f"Scanning attachment text of length {len(request.text)}")
        sanitized_text, results, risk_scores = scan_prompt(
            scanners=_scanners, prompt=request.text, fail_fast=request.fail_fast
        )
        is_valid = all(results.values())
        scanner_names = [type(s).__name__ for s in _scanners]
        return ScanResponse(
            sanitized_text=sanitized_text,
            is_valid=is_valid,
            results=results,
            risk_scores=risk_scores,
            scanners_used=scanner_names,
        )
    except Exception as e:
        logger.error(f"Attachment scan failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("LLM_GUARD_PORT", "8000")))
