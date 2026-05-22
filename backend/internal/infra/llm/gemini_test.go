package llm

import "testing"

func TestParseGeminiResponseReasoningAndCitations(t *testing.T) {
	result, err := parseGeminiResponse([]byte(`{
		"responseId": "gemini-response-1",
		"candidates": [
			{
				"content": {
					"parts": [
						{"text": "internal reasoning", "thought": true, "thoughtSignature": "sig-1"},
						{"text": "final answer"}
					]
				},
				"groundingMetadata": {
					"groundingChunks": [
						{"web": {"uri": "https://example.com/a", "title": "A"}},
						{"retrievedContext": {"uri": "https://example.com/b"}}
					]
				},
				"urlContextMetadata": {
					"urlMetadata": [
						{"retrievedUrl": "https://example.com/c"}
					]
				}
			}
		]
	}`))
	if err != nil {
		t.Fatalf("parse gemini response: %v", err)
	}
	if result.Text != "final answer" {
		t.Fatalf("expected final answer without thought text, got %#v", result.Text)
	}
	if result.Reasoning == nil || result.Reasoning.Text != "internal reasoning" || result.Reasoning.Signature != "sig-1" {
		t.Fatalf("expected Gemini reasoning output, got %#v", result.Reasoning)
	}
	if len(result.Citations) != 3 || result.Citations[0] != "https://example.com/a" || result.Citations[2] != "https://example.com/c" {
		t.Fatalf("expected Gemini citations, got %#v", result.Citations)
	}
}

func TestApplyGeminiStreamChunkStoresReasoningAndCitations(t *testing.T) {
	result := &GenerateOutput{ToolCalls: make([]ToolCall, 0)}
	var reasoningText string
	err := applyGeminiStreamChunk(mustDecodeObject(t, `{
		"responseId": "gemini-stream-1",
		"candidates": [
			{
				"content": {
					"parts": [
						{"text": "think", "thought": true, "thoughtSignature": "sig-stream"},
						{"text": "answer"}
					]
				},
				"groundingMetadata": {
					"groundingChunks": [
						{"web": {"uri": "https://example.com/source"}}
					]
				}
			}
		]
	}`), result, func(event GenerateStreamEvent) error {
		if event.Reasoning != nil {
			reasoningText += event.Reasoning.Text
		}
		return nil
	})
	if err != nil {
		t.Fatalf("apply gemini stream chunk: %v", err)
	}
	if result.ResponseID != "gemini-stream-1" || result.Text != "answer" {
		t.Fatalf("expected response id and answer text, got %#v", result)
	}
	if reasoningText != "think" || result.Reasoning == nil || result.Reasoning.Text != "think" || result.Reasoning.Signature != "sig-stream" {
		t.Fatalf("expected stored and emitted reasoning, got text=%q result=%#v", reasoningText, result.Reasoning)
	}
	if len(result.Citations) != 1 || result.Citations[0] != "https://example.com/source" {
		t.Fatalf("expected stream citations, got %#v", result.Citations)
	}
}

func TestBuildGeminiImageGenerationRequestBody(t *testing.T) {
	payload, err := buildGeminiImageGenerationRequestBody(GenerateInput{
		Messages: []Message{
			{Role: "system", Content: "ignore"},
			{Role: "user", Content: "A clean product render"},
		},
		Options: map[string]interface{}{
			"imageConfig": map[string]interface{}{
				"aspect_ratio": "1:1",
			},
			"generationConfig": map[string]interface{}{
				"imageConfig": map[string]interface{}{
					"image_size": "2K",
				},
			},
			"aspect_ratio": "16:9",
			"prompt":       "override",
			"stream":       true,
		},
	})
	if err != nil {
		t.Fatalf("build gemini image request body: %v", err)
	}
	contents := payload["contents"].([]map[string]interface{})
	parts := contents[0]["parts"].([]map[string]interface{})
	if parts[0]["text"] != "A clean product render" {
		t.Fatalf("expected last user prompt, got %#v", payload)
	}
	config := payload["generationConfig"].(map[string]interface{})
	modalities := config["responseModalities"].([]string)
	if len(modalities) != 1 || modalities[0] != "IMAGE" {
		t.Fatalf("expected image response modality, got %#v", config["responseModalities"])
	}
	imageConfig := asMap(asMap(config["responseFormat"])["image"])
	if imageConfig["aspectRatio"] != "16:9" || imageConfig["imageSize"] != "2K" {
		t.Fatalf("expected image response format, got %#v", config)
	}
	if _, ok := payload["stream"]; ok {
		t.Fatalf("stream must not be passed to Gemini image generation: %#v", payload)
	}
}

func TestNormalizeGeminiImageGenerationModelAliases(t *testing.T) {
	tests := map[string]string{
		"nano-banana-2":     "gemini-3.1-flash-image-preview",
		"nano-banana-pro":   "gemini-3-pro-image-preview",
		"nano-banana":       "gemini-2.5-flash-image",
		"gemini-custom-img": "gemini-custom-img",
	}

	for input, expected := range tests {
		if got := normalizeGeminiImageGenerationModel(input); got != expected {
			t.Fatalf("normalizeGeminiImageGenerationModel(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestParseGeminiImageGenerationOutput(t *testing.T) {
	output, err := parseGeminiImageGenerationOutput([]byte(`{
		"responseId": "gemini-image-1",
		"candidates": [
			{
				"content": {
					"parts": [
						{"text": "A revised prompt"},
						{"inlineData": {"mimeType": "image/png", "data": "iVBORw0KGgo="}}
					]
				}
			},
			{
				"content": {
					"parts": [
						{"inline_data": {"mime_type": "image/webp", "data": "UklGRg=="}}
					]
				}
			}
		],
		"usageMetadata": {
			"promptTokenCount": 15,
			"candidatesTokenCount": 7,
			"cachedContentTokenCount": 3
		}
	}`))
	if err != nil {
		t.Fatalf("parse gemini image output: %v", err)
	}
	if output.ResponseID != "gemini-image-1" {
		t.Fatalf("expected response id, got %q", output.ResponseID)
	}
	if len(output.GeneratedImages) != 2 {
		t.Fatalf("expected generated images, got %#v", output.GeneratedImages)
	}
	if output.GeneratedImages[0].B64JSON != "iVBORw0KGgo=" || output.GeneratedImages[0].MIMEType != "image/png" {
		t.Fatalf("unexpected first image: %#v", output.GeneratedImages[0])
	}
	if output.GeneratedImages[1].B64JSON != "UklGRg==" || output.GeneratedImages[1].MIMEType != "image/webp" {
		t.Fatalf("unexpected second image: %#v", output.GeneratedImages[1])
	}
	if output.GeneratedImages[0].RevisedPrompt != "A revised prompt" {
		t.Fatalf("expected revised prompt, got %#v", output.GeneratedImages[0])
	}
	if output.Usage.InputTokens != 12 || output.Usage.OutputTokens != 7 || output.Usage.CacheReadTokens != 3 {
		t.Fatalf("expected parsed usage, got %#v", output.Usage)
	}
}
