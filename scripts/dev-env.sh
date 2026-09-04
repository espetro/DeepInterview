# Worker env for local app testing: Bifrost LLM + local parakeet STT +
# pocket-tts (via shim). Source before starting the di server; the Bifrost
# key never touches disk (pulled from the macOS keychain at source time).
export DI_LLM__PROVIDER=openai
export DI_LLM__BASE_URL=http://localhost:8317/v1
export DI_LLM__MODEL=zai-coding-plan/glm-4.5-air
DI_LLM__API_KEY="$(security find-generic-password -s bifrost -a "$USER" -w)" && export DI_LLM__API_KEY
export DI_STT__BASE_URL=http://localhost:9003
export DI_STT__MODEL=parakeet-tdt
export DI_STT__MODE=buffered
export DI_TTS__BASE_URL=http://localhost:9005
export DI_TTS__MODEL=pocket
export DI_TTS__VOICE=default
