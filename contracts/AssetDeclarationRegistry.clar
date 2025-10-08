(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-ALREADY-DECLARED u101)
(define-constant ERR-INVALID-HASH u102)
(define-constant ERR-INVALID-ENCRYPTED-DATA u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-DECLARATION-NOT-FOUND u105)
(define-constant ERR_INVALID-OFFICIAL u106)
(define-constant ERR_MAX_DECLARATIONS_EXCEEDED u107)
(define-constant ERR_INVALID_UPDATE_PARAM u108)
(define-constant ERR_AUTHORITY_NOT_VERIFIED u109)
(define-constant ERR_INVALID_STATUS u110)
(define-constant ERR_INVALID_MIN_HASH_LEN u111)
(define-constant ERR_INVALID_MAX_DATA_SIZE u112)
(define-constant ERR_UPDATE_NOT_ALLOWED u113)
(define-constant ERR_INVALID_CURRENCY u114)
(define-constant ERR_INVALID_LOCATION u115)
(define-constant ERR_INVALID_GRACE_PERIOD u116)
(define-constant ERR_INVALID_INTEREST_RATE u117)
(define-constant ERR_INVALID_GROUP_TYPE u118)
(define-constant ERR_INVALID_DECLARATION_TYPE u119)
(define-constant ERR_INVALID_VERIFIER u120)

(define-data-var declaration-counter uint u0)
(define-data-var max-declarations uint u10000)
(define-data-var registration-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map Declarations
  { official: principal, declaration-id: uint }
  {
    hash: (buff 32),
    timestamp: uint,
    encrypted-data: (buff 256),
    status: bool,
    currency: (string-utf8 20),
    location: (string-utf8 100),
    grace-period: uint,
    interest-rate: uint,
    declaration-type: (string-utf8 50)
  }
)

(define-map DeclarationsByType
  (string-utf8 50)
  uint)

(define-map DeclarationUpdates
  { official: principal, declaration-id: uint }
  {
    update-hash: (buff 32),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-declaration (official principal) (declaration-id uint))
  (map-get? Declarations { official: official, declaration-id: declaration-id })
)

(define-read-only (get-declaration-updates (official principal) (declaration-id uint))
  (map-get? DeclarationUpdates { official: official, declaration-id: declaration-id })
)

(define-read-only (is-declaration-registered (declaration-type (string-utf8 50)))
  (is-some (map-get? DeclarationsByType declaration-type))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-encrypted-data (data (buff 256)))
  (if (<= (len data) u256)
      (ok true)
      (err ERR-INVALID_ENCRYPTED-DATA))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-official (official principal))
  (if (not (is-eq official 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR_INVALID-OFFICIAL))
)

(define-private (validate-status (status bool))
  (ok true)
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
      (ok true)
      (err ERR_INVALID_CURRENCY))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR_INVALID_LOCATION))
)

(define-private (validate-grace-period (period uint))
  (if (<= period u30)
      (ok true)
      (err ERR_INVALID_GRACE_PERIOD))
)

(define-private (validate-interest-rate (rate uint))
  (if (<= rate u20)
      (ok true)
      (err ERR_INVALID_INTEREST_RATE))
)

(define-private (validate-declaration-type (dtype (string-utf8 50)))
  (if (or (is-eq dtype "annual") (is-eq dtype "quarterly") (is-eq dtype "special"))
      (ok true)
      (err ERR_INVALID_DECLARATION_TYPE))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-official contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR_AUTHORITY_NOT_VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-declarations (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR_MAX_DECLARATIONS_EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_VERIFIED))
    (var-set max-declarations new-max)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR_INVALID_UPDATE_PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_VERIFIED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-declaration
  (hash (buff 32))
  (encrypted-data (buff 256))
  (currency (string-utf8 20))
  (location (string-utf8 100))
  (grace-period uint)
  (interest-rate uint)
  (declaration-type (string-utf8 50))
)
  (let (
        (next-id (+ (var-get declaration-counter) u1))
        (current-max (var-get max-declarations))
        (authority (var-get authority-contract))
      )
    (asserts! (< (var-get declaration-counter) current-max) (err ERR_MAX_DECLARATIONS_EXCEEDED))
    (try! (validate-hash hash))
    (try! (validate-encrypted-data encrypted-data))
    (try! (validate-currency currency))
    (try! (validate-location location))
    (try! (validate-grace-period grace-period))
    (try! (validate-interest-rate interest-rate))
    (try! (validate-declaration-type declaration-type))
    (asserts! (is-none (map-get? Declarations { official: tx-sender, declaration-id: next-id })) (err ERR_ALREADY_DECLARED))
    (let ((authority-recipient (unwrap! authority (err ERR_AUTHORITY_NOT_VERIFIED))))
      (try! (stx-transfer? (var-get registration-fee) tx-sender authority-recipient))
    )
    (map-set Declarations { official: tx-sender, declaration-id: next-id }
      {
        hash: hash,
        timestamp: block-height,
        encrypted-data: encrypted-data,
        status: true,
        currency: currency,
        location: location,
        grace-period: grace-period,
        interest-rate: interest-rate,
        declaration-type: declaration-type
      }
    )
    (map-set DeclarationsByType declaration-type next-id)
    (var-set declaration-counter next-id)
    (print { event: "declaration-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (update-declaration
  (declaration-id uint)
  (update-hash (buff 32))
  (update-encrypted-data (buff 256))
)
  (let ((decl (map-get? Declarations { official: tx-sender, declaration-id: declaration-id })))
    (match decl
      d
        (begin
          (asserts! (is-eq tx-sender tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-hash update-hash))
          (try! (validate-encrypted-data update-encrypted-data))
          (map-set Declarations { official: tx-sender, declaration-id: declaration-id }
            (merge d {
              hash: update-hash,
              timestamp: block-height,
              encrypted-data: update-encrypted-data
            })
          )
          (map-set DeclarationUpdates { official: tx-sender, declaration-id: declaration-id }
            {
              update-hash: update-hash,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "declaration-updated", id: declaration-id })
          (ok true)
        )
      (err ERR_DECLARATION-NOT-FOUND)
    )
  )
)

(define-public (get-declaration-count)
  (ok (var-get declaration-counter))
)

(define-public (check-declaration-existence (declaration-type (string-utf8 50)))
  (ok (is-declaration-registered declaration-type))
)