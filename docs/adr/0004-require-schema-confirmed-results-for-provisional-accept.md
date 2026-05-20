# Require schema-confirmed results for provisional accept

OMA reports `verdict=provisional_accept` only when an auxiliary agent emits a schema-valid **Auxiliary Task Return**. Free-form ACPX answers may be extracted into **Extracted Auxiliary Findings**, but they return `verdict=revise` so the **Host Agent** knows integration still requires review.

This keeps OMA's stdout useful without turning raw transcripts into trusted structured results.
