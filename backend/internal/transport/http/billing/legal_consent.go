package billing

import (
	"net/http"

	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/shared/response"
	"github.com/gin-gonic/gin"
)

const legalConsentRequiredCode = "legal.consent_required"

func legalConsentAccepted(termsAccepted bool, privacyAccepted bool) bool {
	return termsAccepted && privacyAccepted
}

func rejectMissingLegalConsent(c *gin.Context) {
	response.ErrorWithCode(c, http.StatusBadRequest, legalConsentRequiredCode, "terms of service and privacy policy must be accepted")
}
