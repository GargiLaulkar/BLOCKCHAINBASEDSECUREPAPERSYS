import React, { useState } from 'react';
import {
  tokens,
  standardAuditPairs,
  getContrastRatio,
  Button,
  Field,
  FieldError,
  Select,
  Dialog,
  Popover,
  Tabs,
  ToastProvider,
  useToast,
  Tooltip,
  EmptyState,
  CustodyBubbles,
  Coupon,
  Rosette,
  Serial,
  HashChip,
  ThresholdMeter,
  CountdownLock,
  LedgerTable,
  TxDrawer,
  StateStamp,
  ExamState,
  TxStatus,
} from '@sigil/ui';

function ToastButtons() {
  const { showToast } = useToast();
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => showToast({ title: 'Information notice', description: 'Exam batch synchronized with ledger.', variant: 'info' })}
      >
        Trigger info toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => showToast({ title: 'Paper release confirmed', description: 'Threshold reached: 3 of 5 shares verified.', variant: 'success' })}
      >
        Trigger success toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => showToast({ title: 'Transaction reverted', description: 'Error: QuotaNotMet(sectionId: 1, have: 48, need: 50).', variant: 'alert' })}
      >
        Trigger alert toast
      </Button>
    </div>
  );
}

export function ComponentGallery() {
  // Interactive state demo
  const [bubbleState, setBubbleState] = useState<ExamState>('Sealed');
  const [selectVal, setSelectVal] = useState('physics');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [interactiveHash, setInteractiveHash] = useState('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
  const [txState, setTxState] = useState<TxStatus>('pending');
  const [thresholdCount, setThresholdCount] = useState(3);

  // Table sample data
  const tableData = [
    { serial: 1, title: 'National entrance evaluation 2026', state: 'Sealed' as ExamState, holders: '3 / 5', created: '2026-10-31' },
    { serial: 2, title: 'State eligibility diagnostic paper', state: 'Collecting' as ExamState, holders: '0 / 3', created: '2026-10-30' },
    { serial: 3, title: 'General physics quota test', state: 'Released' as ExamState, holders: '4 / 5', created: '2026-10-28' },
    { serial: 4, title: 'Biology core section trial', state: 'Cancelled' as ExamState, holders: '1 / 3', created: '2026-10-25' },
    { serial: 7, title: 'Practice exam, September', state: 'Draft' as ExamState, holders: '0 / 4', created: '2026-10-24' },
  ];

  return (
    <ToastProvider>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
        
        {/* Header */}
        <header style={{ borderBottom: '1px solid var(--sigil-color-hairline)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="sigil-mono" style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>
                SIGIL DESIGN SYSTEM
              </span>
              <h1 style={{ margin: '4px 0 0 0' }}>Security paper component gallery</h1>
              <p style={{ color: 'var(--sigil-color-slate)', margin: '8px 0 0 0' }}>
                Tasks FA-01, FA-02, FA-03 · Pure CSS tokens, Radix UI primitives, security-printed signature components.
              </p>
            </div>
            <a href="/" style={{ fontSize: '13px', textDecoration: 'none', border: '1px solid var(--sigil-color-ink)', padding: '6px 12px', borderRadius: '3px' }}>
              ← Return to application
            </a>
          </div>
        </header>

        {/* ============================================================== */}
        {/* FA-01: DESIGN TOKENS & CONTRAST AUDIT                          */}
        {/* ============================================================== */}
        <section id="fa-01-tokens">
          <h2>FA-01: Design tokens & WCAG AA contrast audit</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Colour palette from section 10.3 and approved UI reference. Tested with automated WCAG 2.1 relative luminance algorithms.
          </p>

          {/* Color swatches */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px', marginTop: '16px' }}>
            {Object.entries(tokens.colors).map(([name, hex]) => (
              <div
                key={name}
                style={{
                  backgroundColor: 'var(--sigil-color-sheet)',
                  border: '1px solid var(--sigil-color-hairline)',
                  borderRadius: '3px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    backgroundColor: hex,
                    height: '48px',
                    borderRadius: '2px',
                    border: name === 'sheet' || name === 'mist' ? '1px solid var(--sigil-color-hairline)' : 'none',
                  }}
                />
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{name}</div>
                <div className="sigil-mono" style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>
                  {hex}
                </div>
              </div>
            ))}
          </div>

          {/* Contrast Check Table */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>WCAG AA contrast audit table</h3>
            <div className="sigil-ledger-table-wrap">
              <table className="sigil-ledger-table">
                <thead>
                  <tr>
                    <th>Use case</th>
                    <th>Foreground</th>
                    <th>Background</th>
                    <th>Contrast ratio</th>
                    <th>Normal text (≥ 4.5:1)</th>
                    <th>Large / UI (≥ 3.0:1)</th>
                  </tr>
                </thead>
                <tbody>
                  {standardAuditPairs.map((pair) => (
                    <tr key={pair.useCase}>
                      <td>{pair.useCase}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '12px', height: '12px', backgroundColor: pair.fgHex, display: 'inline-block', border: '1px solid #ccc' }} />
                          <strong>{pair.fgName}</strong> ({pair.fgHex})
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '12px', height: '12px', backgroundColor: pair.bgHex, display: 'inline-block', border: '1px solid #ccc' }} />
                          <strong>{pair.bgName}</strong> ({pair.bgHex})
                        </span>
                      </td>
                      <td className="sigil-mono" style={{ fontWeight: 600 }}>
                        {pair.ratio.toFixed(2)}:1
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '2px',
                            backgroundColor: pair.passNormal ? 'rgba(29, 122, 87, 0.15)' : 'rgba(176, 58, 46, 0.15)',
                            color: pair.passNormal ? 'var(--sigil-color-verified)' : 'var(--sigil-color-alert)',
                          }}
                        >
                          {pair.passNormal ? 'Pass AA' : 'Fail normal'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '2px',
                            backgroundColor: pair.passUI ? 'rgba(29, 122, 87, 0.15)' : 'rgba(176, 58, 46, 0.15)',
                            color: pair.passUI ? 'var(--sigil-color-verified)' : 'var(--sigil-color-alert)',
                          }}
                        >
                          {pair.passUI ? 'Pass UI/Large' : 'Fail'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Typography scale */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>Typography scale (Atkinson Hyperlegible Next & Mono)</h3>
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <div style={{ fontSize: '40px', fontWeight: 700 }}>40px Display: Section 10.3 typography headline</div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px' }}>28px XL: Official custody verification summary</div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '8px' }}>22px LG: Exam lifecycle control docket</div>
              <div style={{ fontSize: '17px', fontWeight: 600, marginTop: '8px' }}>17px MD: Question bank quotas and cryptographic commitments</div>
              <div style={{ fontSize: '15px', marginTop: '8px' }}>15px Base: Body text line length stays under 75 characters for optimal human comprehension during irreversible operations.</div>
              <div style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', marginTop: '8px' }}>13px XS: Secondary annotations, table headers, hash commitments, and audit timestamps.</div>
              <div className="sigil-mono" style={{ fontSize: '15px', marginTop: '12px', color: 'var(--sigil-color-ink)' }}>
                Mono numerals & letters: 0 vs O distinction, 1 vs l vs I distinction (0x7F01aA4B901CDE)
              </div>
            </div>
          </div>

          {/* Focus & Reduced Motion */}
          <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Marigold focus ring</h4>
              <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>
                Press <kbd style={{ padding: '2px 4px', background: 'var(--sigil-color-mist)', borderRadius: '2px' }}>Tab</kbd> to focus interactive elements. High-contrast 2px outline in marigold (<code>#E59A0E</code>) with 2px offset.
              </p>
              <button className="sigil-button sigil-button--secondary sigil-button--sm">
                Tab to test focus
              </button>
            </div>
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Motion rules</h4>
              <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>
                Honors <code>prefers-reduced-motion: reduce</code>. Motion is restricted strictly to user actions (opening modals, transaction state change) and single seal-break animation.
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* FA-02: PRIMITIVE RADIX COMPONENTS                              */}
        {/* ============================================================== */}
        <section id="fa-02-primitives">
          <h2>FA-02: Primitive components (Radix UI re-themed)</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Headless Radix primitives themed with security paper tokens. Full keyboard navigation and ARIA semantics.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '16px' }}>
            {/* Buttons */}
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Buttons</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Button variant="primary">Primary ink</Button>
                  <Button variant="secondary">Secondary outline</Button>
                  <Button variant="ghost">Ghost</Button>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Button variant="alert">Alert action</Button>
                  <Button variant="primary" disabled>Disabled</Button>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Button size="sm">Small (28px)</Button>
                  <Button size="md">Medium (38px)</Button>
                  <Button size="lg">Large (46px)</Button>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Field & FieldError</h3>
              <Field
                id="exam-code"
                label="Exam administrative code"
                description="Unique uppercase identifier registered on blockchain"
                placeholder="e.g. NEET-UG-2026-A"
                defaultValue="SIGIL-2026-DEMO"
              />
              <Field
                id="error-field"
                label="Passphrase verification"
                placeholder="Enter keystore passphrase"
                type="password"
                error="Passphrase must be at least 12 characters with uppercase and numeric characters"
              />
            </div>

            {/* Select Primitive */}
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Select</h3>
              <Select
                label="Designated section"
                description="Select target exam section for question quotas"
                value={selectVal}
                onValueChange={setSelectVal}
                options={[
                  { value: 'physics', label: 'Section 1: Physics (45 questions)' },
                  { value: 'chemistry', label: 'Section 2: Chemistry (45 questions)' },
                  { value: 'botany', label: 'Section 3: Botany (45 questions)' },
                  { value: 'zoology', label: 'Section 4: Zoology (45 questions)' },
                ]}
              />
            </div>

            {/* Dialog / Popover / Tooltip */}
            <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Dialog, Popover & Tooltip</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <Dialog
                  open={dialogOpen}
                  onOpenChange={setDialogOpen}
                  trigger={<Button variant="secondary" size="sm">Open modal dialog</Button>}
                  title="Cryptographic verification confirmation"
                  description="Review threshold parameters before sealing the question bank."
                >
                  <p style={{ fontSize: '15px', lineHeight: '1.5', margin: '16px 0' }}>
                    Once this dialog is accepted, the ECDH key ceremony commitments will be permanently submitted on-chain.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={() => setDialogOpen(false)}>Confirm action</Button>
                  </div>
                </Dialog>

                <Popover
                  trigger={<Button variant="ghost" size="sm">Open popover</Button>}
                >
                  <div style={{ fontSize: '13px' }}>
                    <strong>Section Quota Status</strong>
                    <p style={{ margin: '6px 0 0 0', color: 'var(--sigil-color-slate)' }}>
                      Physics: 50 / 45 submitted.<br />
                      Chemistry: 48 / 45 submitted.
                    </p>
                  </div>
                </Popover>

                <Tooltip content="Deterministic hypotrochoid pattern derived from exam bankHash">
                  <span style={{ fontSize: '13px', textDecoration: 'underline', cursor: 'help' }}>
                    Hover for tooltip
                  </span>
                </Tooltip>
              </div>

              {/* Toasts */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Radix Toasts:</div>
                <ToastButtons />
              </div>
            </div>
          </div>

          {/* Tabs primitive */}
          <div style={{ marginTop: '20px', background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Tabs</h3>
            <Tabs
              defaultValue="general"
              items={[
                {
                  value: 'general',
                  label: 'General overview',
                  content: <p style={{ fontSize: '15px', margin: '8px 0' }}>Displaying global schedule and release windows.</p>,
                },
                {
                  value: 'quotas',
                  label: 'Question quotas',
                  content: <p style={{ fontSize: '15px', margin: '8px 0' }}>All 4 sections have met their quotas. Question bank ready for sealing.</p>,
                },
                {
                  value: 'participants',
                  label: 'Assigned panel',
                  content: <p style={{ fontSize: '15px', margin: '8px 0' }}>5 key holders registered, threshold t = 3.</p>,
                },
              ]}
            />
          </div>

          {/* EmptyState */}
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>EmptyState (§3.4 no dummy data rule)</h3>
            <EmptyState
              title="No examinations on this ledger"
              description="No exams have been initialized yet. Use the Create Exam wizard to draft and seal an examination schedule."
              action={<Button variant="secondary" size="sm">Launch Create Exam wizard</Button>}
            />
          </div>
        </section>

        {/* ============================================================== */}
        {/* FA-03: SIGNATURE SECURITY-PAPER COMPONENTS                     */}
        {/* ============================================================== */}
        <section id="fa-03-signature">
          <h2>FA-03: Signature security-paper components</h2>
          <p style={{ color: 'var(--sigil-color-slate)' }}>
            Components carrying cryptographic truth: rosette visual checksums, horizontal custody strips, dashed coupons, square threshold notches, and mono serials.
          </p>

          {/* CustodyBubbles */}
          <div style={{ background: 'var(--sigil-color-sheet)', padding: '20px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', margin: 0 }}>CustodyBubbles (horizontal strip & compact inline)</h3>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>Preview state:</span>
                {(['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'] as ExamState[]).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={bubbleState === st ? 'primary' : 'secondary'}
                    onClick={() => setBubbleState(st)}
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </div>

            {/* Horizontal strip */}
            <div style={{ padding: '8px 0', borderBottom: '1px solid var(--sigil-color-hairline)', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginBottom: '4px' }}>
                HORIZONTAL CUSTODY STRIP (Option B approved layout):
              </div>
              <CustodyBubbles currentState={bubbleState} variant="strip" />
            </div>

            {/* Inline docket variant */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--sigil-color-slate)' }}>Compact inline variant (for table rows):</span>
              <CustodyBubbles currentState={bubbleState} variant="inline" />
              <StateStamp state={bubbleState} />
            </div>
          </div>

          {/* Rosette visual checksum */}
          <div style={{ background: 'var(--sigil-color-sheet)', padding: '20px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px', marginTop: '20px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Rosette (deterministic fine-line hypotrochoid from hash)</h3>
            <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 16px 0' }}>
              Deterministic <code>rosettePath(hash)</code> at fixed 2-decimal precision. Verified by Vitest snapshot tests.
            </p>

            <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <Rosette hash="0x0000000000000000000000000000000000000000000000000000000000000000" size={52} />
                <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginTop: '4px' }}>52px (Zero vector)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Rosette hash="0x1111111111111111111111111111111111111111111111111111111111111111" size={52} />
                <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginTop: '4px' }}>52px (Vector 1)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Rosette hash="0x2222222222222222222222222222222222222222222222222222222222222222" size={52} />
                <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginTop: '4px' }}>52px (Vector 2)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Rosette hash={interactiveHash} size={72} />
                <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', marginTop: '4px' }}>72px (Interactive)</div>
              </div>

              <div style={{ flex: 1, minWidth: '260px' }}>
                <Field
                  id="interactive-hash"
                  label="Test hash for rosette determinism"
                  value={interactiveHash}
                  onChange={(e) => setInteractiveHash(e.target.value)}
                  mono
                />
              </div>
            </div>
          </div>

          {/* Coupon, ThresholdMeter, CountdownLock, Serial, HashChip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {/* Coupon Panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Coupon
                title="Seal exam (permanent)"
                consequence="Once sealed, question collection closes permanently and bankHash is committed to the blockchain."
                actionLabel="Sign & seal exam"
                isReady={true}
                onAction={() => alert('Seal action invoked!')}
              />

              <Coupon
                title="Conclude exam (permanent)"
                consequence="Finalizes examination status on-chain. Decryption shares and copies remain archived."
                actionLabel="Conclude exam"
                isReady={false}
                disabledReason="Prerequisite not met: exam period ends at block time 1730419200."
              />
            </div>

            {/* ThresholdMeter & CountdownLock */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '15px', margin: 0 }}>ThresholdMeter (square notches)</h3>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        size="sm"
                        variant={thresholdCount === n ? 'primary' : 'ghost'}
                        onClick={() => setThresholdCount(n)}
                        style={{ padding: '2px 6px', height: '24px' }}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
                  16px square notches to distinguish threshold status from round custody bubbles.
                </p>
                <ThresholdMeter current={thresholdCount} threshold={3} total={5} />
              </div>

              <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
                <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>CountdownLock</h3>
                <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
                  Mono 20px time with filled marigold square indicator.
                </p>
                <CountdownLock
                  targetTimestamp={Math.floor(Date.now() / 1000) + 7200}
                  label="Time-lock release window opens in"
                />
              </div>

              <div style={{ background: 'var(--sigil-color-sheet)', padding: '16px', border: '1px solid var(--sigil-color-hairline)', borderRadius: '3px' }}>
                <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Serial & HashChip</h3>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>Exam Serial:</div>
                    <Serial id={7} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>High serial:</div>
                    <Serial id={1024} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--sigil-color-slate)' }}>HashChip (click to copy):</div>
                    <HashChip hash="0x8f2d5a3c9b4e1f7a0d2c5e8b1a4f7c0d3e6b9a2f" txUrl="https://etherscan.io" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LedgerTable */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>LedgerTable (sortable, keyboard navigable, 0-radius)</h3>
            <LedgerTable
              caption="Examination Docket Ledger"
              keyField="serial"
              columns={[
                {
                  key: 'serial',
                  header: 'Serial',
                  mono: true,
                  sortable: true,
                  render: (row) => <Serial id={row.serial} />,
                },
                {
                  key: 'title',
                  header: 'Title',
                  sortable: true,
                },
                {
                  key: 'state',
                  header: 'Custody status',
                  render: (row) => (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <CustodyBubbles currentState={row.state} variant="inline" />
                      <span style={{ fontSize: '13px' }}>{row.state}</span>
                    </div>
                  ),
                },
                {
                  key: 'holders',
                  header: 'Holders',
                  mono: true,
                  sortable: true,
                },
                {
                  key: 'created',
                  header: 'Created date',
                  mono: true,
                  sortable: true,
                },
              ]}
              data={tableData}
              onRowClick={(row) => alert(`Selected exam serial No. ${row.serial}`)}
            />
          </div>

          {/* TxDrawer States */}
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '15px', margin: 0 }}>TxDrawer (transaction lifecycle drawer)</h3>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['preparing', 'awaiting-signature', 'pending', 'confirmed', 'failed'] as TxStatus[]).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={txState === st ? 'primary' : 'ghost'}
                    onClick={() => setTxState(st)}
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </div>

            <TxDrawer
              status={txState}
              title="Submit batch verification transaction"
              txHash="0x3f5c7a9b1d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a"
              blockConfirmations={2}
              requiredConfirmations={3}
              errorMessage={txState === 'failed' ? 'QuotaNotMet(sectionId: 0, have: 40, need: 45)' : undefined}
              onRetry={() => setTxState('preparing')}
              onClose={() => alert('Closed TxDrawer')}
            />
          </div>
        </section>

      </div>
    </ToastProvider>
  );
}
