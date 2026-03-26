import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ICONS } from '../Icons';

const PARSER_API_URL = import.meta.env.VITE_PARSER_API_URL || 'http://localhost:8001';

export default function Review() {
    const [searchParams] = useSearchParams();
    const documentId = searchParams.get("id");
    const navigate = useNavigate();

    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isApproved, setIsApproved] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [userAccounts, setUserAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState(null);
    const [isLinkingAccount, setIsLinkingAccount] = useState(false);
    const [accountLinked, setAccountLinked] = useState(false);

    useEffect(() => {
        if (!documentId) {
            setError("No document ID provided.");
            setIsLoading(false);
            return;
        }

        const fetchReviewData = async () => {
            try {
                const res = await fetch(`${PARSER_API_URL}/api/documents/${documentId}/transactions`);
                const txnData = await res.json();

                const statusRes = await fetch(`${PARSER_API_URL}/api/documents/${documentId}/status`);
                const statusData = await statusRes.json();

                setData({
                    bank_name: statusData.institution_name || "Unknown Bank",
                    code_transactions: txnData.code_results?.map(r => r.transaction_json) || [],
                    llm_transactions: txnData.llm_results?.map(r => r.transaction_json) || [],
                    identifier_json: {},
                    status: statusData.status,
                    user_accounts: [], // TODO: Fetch from main API
                    selected_account_id: statusData.account_id
                });

                if (statusData.account_id) {
                    setSelectedAccountId(statusData.account_id);
                    setAccountLinked(true);
                }

                if (statusData.status === "APPROVED") {
                    setIsApproved(true);
                    setAccountLinked(true);
                }
            } catch (err) {
                console.error(err);
                setError("Failed to fetch review data. Ensure the document has been processed.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchReviewData();
    }, [documentId]);

    const handleApprove = async () => {
        if (!selectedAccountId) {
            alert("Please select an account first");
            return;
        }

        setIsApproving(true);
        try {
            const formData = new URLSearchParams();
            formData.append('account_id', selectedAccountId);
            formData.append('selected_parser', 'CODE'); // Default to CODE

            const response = await fetch(`${PARSER_API_URL}/api/documents/${documentId}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData
            });

            if (!response.ok) throw new Error('Approval failed');

            setIsApproved(true);

            // Redirect to transactions page after 1 second
            setTimeout(() => {
                navigate('/transactions');
            }, 1000);
        } catch (err) {
            console.error(err);
            alert("Approval failed: " + err.message);
        } finally {
            setIsApproving(false);
        }
    };

    const handleDownloadJson = async () => {
        try {
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safeName = (data?.bank_name || "transactions").replace(/\s+/g, "_");
            a.download = `${safeName}_transactions.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert("Download failed: " + err.message);
        }
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <ICONS.Loader size={48} color="#6366f1" style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                <h2 style={{ color: '#dc2626' }}>{error || "Something went wrong"}</h2>
                <button
                    onClick={() => navigate("/upload")}
                    style={{
                        marginTop: '1rem',
                        padding: '0.5rem 1.5rem',
                        background: 'transparent',
                        color: '#6366f1',
                        border: '2px solid #6366f1',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                    }}
                >
                    Back to Upload
                </button>
            </div>
        );
    }

    const renderTransactionTable = (transactions, title, icon) => (
        <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '12px',
            padding: '1.5rem 0',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
            border: '1px solid var(--border, #e2e8f0)',
            overflow: 'hidden'
        }}>
            <h3 style={{
                fontSize: '0.95rem',
                marginBottom: '1.25rem',
                padding: '0 1.5rem',
                color: 'var(--text-primary, #1e293b)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 700
            }}>
                {icon} {title}
            </h3>
            <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--table-header-bg, #f9fafb)' }}>
                            <th style={{ paddingLeft: '1.5rem', padding: '0.75rem', textAlign: 'left', color: '#9ca3af', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Date</th>
                            <th style={{ padding: '0.75rem', textAlign: 'left', color: '#9ca3af', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Details</th>
                            <th style={{ padding: '0.75rem', textAlign: 'right', color: '#9ca3af', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Debit</th>
                            <th style={{ padding: '0.75rem', textAlign: 'right', color: '#9ca3af', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Credit</th>
                            <th style={{ padding: '0.75rem', textAlign: 'right', color: '#9ca3af', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Balance</th>
                            <th style={{ paddingRight: '1.5rem', padding: '0.75rem', textAlign: 'center', color: '#9ca3af', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Confidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions && transactions.length > 0 ? transactions.map((tx, i) => (
                            <tr key={i} style={{ transition: 'background 0.2s' }}>
                                <td style={{ paddingLeft: '1.5rem', padding: '0.75rem', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' }}>{tx.date || '-'}</td>
                                <td style={{ padding: '0.75rem', maxWidth: '500px', wordWrap: 'break-word', whiteSpace: 'normal', borderBottom: '1px solid #f3f4f6' }}>{tx.details || '-'}</td>
                                <td style={{ padding: '0.75rem', textAlign: 'right', color: tx.debit ? '#dc2626' : '#d1d5db', fontWeight: tx.debit ? 600 : 400, borderBottom: '1px solid #f3f4f6' }}>
                                    {tx.debit ? tx.debit.toLocaleString() : '-'}
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'right', color: tx.credit ? '#10b981' : '#d1d5db', fontWeight: tx.credit ? 600 : 400, borderBottom: '1px solid #f3f4f6' }}>
                                    {tx.credit ? tx.credit.toLocaleString() : '-'}
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #f3f4f6' }}>
                                    {tx.balance != null ? tx.balance.toLocaleString() : '-'}
                                </td>
                                <td style={{ paddingRight: '1.5rem', padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #f3f4f6' }}>
                                    <span style={{
                                        background: tx.confidence >= 0.9 ? '#d1fae5' : tx.confidence >= 0.7 ? '#fef3c7' : '#fee2e2',
                                        color: tx.confidence >= 0.9 ? '#065f46' : tx.confidence >= 0.7 ? '#92400e' : '#991b1b',
                                        padding: '2px 8px',
                                        borderRadius: '50px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                    }}>
                                        {tx.confidence != null ? (tx.confidence * 100).toFixed(0) + '%' : 'N/A'}
                                    </span>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>No transactions extracted.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div
            style={{ width: '100%', maxWidth: '1400px', margin: '0 auto' }}
        >
            <div style={{ marginBottom: '1.5rem' }}>
                <button
                    onClick={() => navigate(-1)}
                    style={{
                        background: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                        cursor: 'pointer',
                        fontWeight: 600,
                        marginBottom: '0.75rem',
                        padding: 0,
                        fontFamily: 'inherit'
                    }}
                >
                    <ICONS.ChevronLeft size={16} /> Back
                </button>

                <h2 style={{
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    color: 'var(--text-primary, #1e293b)'
                }}>
                    Review Transactions
                </h2>
            </div>

            {/* Metadata bar */}
            <div style={{
                background: 'var(--card-bg, #ffffff)',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                border: '1px solid var(--border, #e2e8f0)',
                display: 'flex',
                alignItems: 'center',
                gap: '2rem',
                marginBottom: '1.5rem'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.65rem', color: '#999', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Building2 size={12} /> Bank Name
                    </label>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary, #1e293b)' }}>{data.bank_name}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.65rem', color: '#999', fontWeight: 600 }}>Code Txns</label>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{data.code_transactions?.length || 0}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.65rem', color: '#999', fontWeight: 600 }}>LLM Txns</label>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{data.llm_transactions?.length || 0}</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={handleDownloadJson}
                        style={{
                            padding: '0.5rem 1.25rem',
                            background: 'transparent',
                            color: '#6366f1',
                            border: '2px solid #6366f1',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            fontFamily: 'inherit',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Download size={15} /> Download JSON
                    </button>

                    {isApproved ? (
                        <button
                            disabled
                            style={{
                                padding: '0.5rem 2rem',
                                background: 'transparent',
                                color: '#10b981',
                                border: '2px solid #10b981',
                                borderRadius: '10px',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                fontFamily: 'inherit',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'default',
                                opacity: 0.85,
                            }}
                        >
                            <CheckCircle size={16} /> APPROVED
                        </button>
                    ) : (
                        <button
                            onClick={handleApprove}
                            disabled={isApproving || !selectedAccountId}
                            style={{
                                padding: '0.5rem 2rem',
                                background: 'transparent',
                                color: '#6366f1',
                                border: '2px solid #6366f1',
                                borderRadius: '10px',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                fontFamily: 'inherit',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: isApproving || !selectedAccountId ? 'not-allowed' : 'pointer',
                                opacity: isApproving || !selectedAccountId ? 0.65 : 1,
                                transition: 'all 0.2s'
                            }}
                        >
                            {isApproving ? (
                                <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> APPROVING...</>
                            ) : (
                                <><Check size={16} /> APPROVE</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Account Selector */}
            <div style={{
                background: 'var(--card-bg, #ffffff)',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                border: '1px solid var(--border, #e2e8f0)',
                marginBottom: '1.5rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: accountLinked ? '#d1fae5' : '#eef2ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Link size={16} color={accountLinked ? '#10b981' : '#6366f1'} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                            Link this document to an account
                        </p>
                        {userAccounts.length > 0 ? (
                            <select
                                value={selectedAccountId || ""}
                                onChange={e => {
                                    setSelectedAccountId(Number(e.target.value) || null);
                                    setAccountLinked(false);
                                }}
                                disabled={isApproved}
                                style={{
                                    width: '100%',
                                    maxWidth: 360,
                                    padding: '0.4rem 0.6rem',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    color: 'var(--text-primary, #1e293b)',
                                    border: '1.5px solid var(--border, #e5e7eb)',
                                    borderRadius: '8px',
                                    background: 'var(--card-bg, #ffffff)',
                                    fontFamily: 'inherit',
                                    cursor: isApproved ? 'not-allowed' : 'pointer',
                                    outline: 'none',
                                }}
                            >
                                <option value="">— Select account —</option>
                                {userAccounts.map(acct => (
                                    <option key={acct.account_id} value={acct.account_id}>
                                        {acct.institution_name} ••••{acct.account_number_last4}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#9ca3af' }}>
                                No accounts added yet. Add accounts from the Accounts page.
                            </p>
                        )}
                    </div>

                    {accountLinked && (
                        <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: '#10b981',
                            background: '#d1fae5',
                            padding: '3px 10px',
                            borderRadius: '50px',
                            flexShrink: 0,
                        }}>
                            ✓ Linked
                        </span>
                    )}
                </div>
            </div>

            {/* Transaction Tables */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {renderTransactionTable(
                    data.code_transactions,
                    "Extracted by Code",
                    <Code size={18} style={{ color: '#10b981' }} />
                )}
                {renderTransactionTable(
                    data.llm_transactions,
                    "Extracted by LLM",
                    <Cpu size={18} style={{ color: '#6366f1' }} />
                )}
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
