;; Opulix Authenticity Certificate Contract
;; Clarity v2
;; Manages digital certificates for luxury goods with versioning, revocation, and metadata updates

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-CERT-ID u101)
(define-constant ERR-CERT-REVOKED u102)
(define-constant ERR-CERT-EXISTS u103)
(define-constant ERR-INVALID-ADDRESS u104)
(define-constant ERR-PAUSED u105)
(define-constant ERR-INVALID-METADATA u106)
(define-constant ERR-VERSION-MISMATCH u107)

;; Contract metadata
(define-constant CONTRACT-NAME "Opulix Authenticity Certificate")
(define-constant CONTRACT-VERSION "1.0.0")

;; Admin and contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var certificate-counter uint u0)

;; Certificate data structure
(define-map certificates 
  { cert-id: uint } 
  { 
    item-id: (string-ascii 64),
    owner: principal,
    issuer: principal,
    issued-at: uint,
    version: uint,
    is-revoked: bool,
    metadata: (string-ascii 256)
  }
)

;; Certificate history for versioning
(define-map certificate-versions 
  { cert-id: uint, version: uint } 
  { 
    metadata: (string-ascii 256),
    updated-at: uint,
    updated-by: principal
  }
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate metadata
(define-private (is-valid-metadata (metadata (string-ascii 256)))
  (and (> (len metadata) u0) (<= (len metadata) u256))
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Issue a new certificate
(define-public (issue-certificate (item-id (string-ascii 64)) (owner principal) (metadata (string-ascii 256)))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq owner 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-ADDRESS))
    (asserts! (is-valid-metadata metadata) (err ERR-INVALID-METADATA))
    (ensure-not-paused)
    (let ((cert-id (+ (var-get certificate-counter) u1)))
      (asserts! (is-none (map-get? certificates { cert-id: cert-id })) (err ERR-CERT-EXISTS))
      (map-set certificates 
        { cert-id: cert-id }
        { 
          item-id: item-id,
          owner: owner,
          issuer: tx-sender,
          issued-at: block-height,
          version: u1,
          is-revoked: false,
          metadata: metadata
        }
      )
      (map-set certificate-versions
        { cert-id: cert-id, version: u1 }
        { metadata: metadata, updated-at: block-height, updated-by: tx-sender }
      )
      (var-set certificate-counter cert-id)
      (ok cert-id)
    )
  )
)

;; Update certificate metadata
(define-public (update-metadata (cert-id uint) (new-metadata (string-ascii 256)))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-metadata new-metadata) (err ERR-INVALID-METADATA))
    (ensure-not-paused)
    (match (map-get? certificates { cert-id: cert-id })
      cert-data
      (begin
        (asserts! (not (get is-revoked cert-data)) (err ERR-CERT-REVOKED))
        (let ((new-version (+ (get version cert-data) u1)))
          (map-set certificates
            { cert-id: cert-id }
            (merge cert-data { version: new-version, metadata: new-metadata })
          )
          (map-set certificate-versions
            { cert-id: cert-id, version: new-version }
            { metadata: new-metadata, updated-at: block-height, updated-by: tx-sender }
          )
          (ok new-version)
        )
      )
      (err ERR-INVALID-CERT-ID)
    )
  )
)

;; Revoke a certificate
(define-public (revoke-certificate (cert-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (ensure-not-paused)
    (match (map-get? certificates { cert-id: cert-id })
      cert-data
      (begin
        (asserts! (not (get is-revoked cert-data)) (err ERR-CERT-REVOKED))
        (map-set certificates
          { cert-id: cert-id }
          (merge cert-data { is-revoked: true })
        )
        (ok true)
      )
      (err ERR-INVALID-CERT-ID)
    )
  )
)

;; Transfer certificate ownership
(define-public (transfer-certificate (cert-id uint) (new-owner principal))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq new-owner 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-ADDRESS))
    (match (map-get? certificates { cert-id: cert-id })
      cert-data
      (begin
        (asserts! (is-eq tx-sender (get owner cert-data)) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (get is-revoked cert-data)) (err ERR-CERT-REVOKED))
        (map-set certificates
          { cert-id: cert-id }
          (merge cert-data { owner: new-owner })
        )
        (ok true)
      )
      (err ERR-INVALID-CERT-ID)
    )
  )
)

;; Verify certificate authenticity
(define-read-only (verify-certificate (cert-id uint) (version uint))
  (match (map-get? certificates { cert-id: cert-id })
    cert-data
    (begin
      (asserts! (not (get is-revoked cert-data)) (err ERR-CERT-REVOKED))
      (asserts! (is-eq (get version cert-data) version) (err ERR-VERSION-MISMATCH))
      (ok true)
    )
    (err ERR-INVALID-CERT-ID)
  )
)

;; Read-only: get certificate details
(define-read-only (get-certificate (cert-id uint))
  (ok (map-get? certificates { cert-id: cert-id }))
)

;; Read-only: get certificate version history
(define-read-only (get-certificate-version (cert-id uint) (version uint))
  (ok (map-get? certificate-versions { cert-id: cert-id, version: version }))
)

;; Read-only: get current admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: get certificate counter
(define-read-only (get-certificate-counter)
  (ok (var-get certificate-counter))
)