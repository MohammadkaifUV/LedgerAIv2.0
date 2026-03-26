import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ICONS } from '../Icons';

const PARSER_API_URL = import.meta.env.VITE_PARSER_API_URL || 'http://localhost:8001';

export default function Upload() {
    const navigate = useNavigate();

    const [file, setFile] = useState(null);
    const [password, setPassword] = useState("");
    const [needsPassword, setNeedsPassword] = useState(false);
    const [pdfType, setPdfType] = useState(null);
    const [status, setStatus] = useState("IDLE");
    const [processingStatus, setProcessingStatus] = useState("");
    const [error, setError] = useState("");
    const [documentId, setDocumentId] = useState(null);
    const fileInputRef = useRef(null);

    const steps = [
        {
            label: "Upload & Detect",
            icon: ICONS.Search,
            statuses: ["DETECTING", "DETECTED", "PASSWORD_REQUIRED", "UPLOADING", "PROCESSING",
                "EXTRACTING_TEXT", "IDENTIFYING_FORMAT", "PARSING_TRANSACTIONS", "AWAITING_REVIEW", "DONE"],
        },
        {
            label: "Text Extraction",
            icon: ICONS.List,
            statuses: ["EXTRACTING_TEXT", "IDENTIFYING_FORMAT", "PARSING_TRANSACTIONS", "AWAITING_REVIEW", "DONE"],
        },
        {
            label: "Format Identification",
            icon: ICONS.Search,
            statuses: ["IDENTIFYING_FORMAT", "PARSING_TRANSACTIONS", "AWAITING_REVIEW", "DONE"],
        },
        {
            label: "Transaction Extraction",
            icon: ICONS.Cpu,
            statuses: ["PARSING_TRANSACTIONS", "AWAITING_REVIEW", "DONE"],
        },
        {
            label: "Validation & Review",
            icon: ICONS.CheckCircle,
            statuses: ["AWAITING_REVIEW", "DONE"],
        },
    ];

    const getStepState = (step, idx) => {
        const currentStatus = processingStatus || status;
        const isIncluded = step.statuses.includes(currentStatus);
        const nextStep = steps[idx + 1];
        const nextActive = nextStep ? nextStep.statuses.includes(currentStatus) : false;

        if (currentStatus === "DONE" || currentStatus === "AWAITING_REVIEW") return "completed";
        if (nextActive) return "completed";
        if (isIncluded && !nextActive) return "active";
        return "pending";
    };

    const getProcessingSubtext = () => {
        const currentStatus = processingStatus || status;
        switch (currentStatus) {
            case "EXTRACTING_TEXT":
                return "Extracting text from PDF pages...";
            case "IDENTIFYING_FORMAT":
                return "Checking if format exists in database...";
            case "PARSING_TRANSACTIONS":
                return "Running extraction pipeline (Code + LLM)...";
            case "AWAITING_REVIEW":
                return "Processing complete! Transactions ready for review.";
            default:
                return "";
        }
    };

    const onFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;
        if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
            setError("Only PDF files are supported.");
            return;
        }

        setFile(selectedFile);
        setError("");
        setPdfType(null);
        setNeedsPassword(false);
        setPassword("");
        setDocumentId(null);
        setProcessingStatus("");
        setStatus("DETECTED");
    };

    const handleUpload = async () => {
        if (!file) return;

        setStatus("UPLOADING");
        setError("");
        setProcessingStatus("UPLOADING");

        const formData = new FormData();
        formData.append("file", file);
        if (password) formData.append("password", password);

        try {
            // TODO: Upload to Supabase storage and create document record
            // For now, simulate document creation
            const docId = Math.floor(Math.random() * 10000);
            setDocumentId(docId);
            setStatus("PROCESSING");
            setProcessingStatus("EXTRACTING_TEXT");

            // Call parser API to process document
            const response = await fetch(`${PARSER_API_URL}/api/documents/process/${docId}`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to start processing');
            }

            // Poll for status
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${PARSER_API_URL}/api/documents/${docId}/status`);
                    const statusData = await statusRes.json();
                    const docStatus = statusData.status;
                    setProcessingStatus(docStatus);

                    if (docStatus === "AWAITING_REVIEW" || docStatus === "APPROVED") {
                        clearInterval(pollInterval);
                        setStatus("DONE");
                        setTimeout(() => navigate(`/upload/review?id=${docId}`), 1500);
                    } else if (docStatus === "FAILED") {
                        clearInterval(pollInterval);
                        setStatus("ERROR");
                        setError("Processing failed. The document could not be parsed.");
                    }
                } catch {
                    // Keep polling
                }
            }, 2000);

            setTimeout(() => clearInterval(pollInterval), 300000);

        } catch (err) {
            setStatus("ERROR");
            setError(err.message || "Upload failed. Please try again.");
        }
    };

    const isProcessing = ["UPLOADING", "PROCESSING"].includes(status);
    const showStepper = !["IDLE", "ERROR"].includes(status);
    const canUpload = file && !isProcessing && (status === "DETECTED" || (status === "PASSWORD_REQUIRED" && password));

    return (
        <div
            style={{ width: '100%', maxWidth: '900px', margin: '0 auto' }}
        >
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    color: 'var(--text-primary, #1e293b)'
                }}>
                    Extract PDF
                </h2>
            </div>

            <div style={{
                background: 'var(--card-bg, #ffffff)',
                borderRadius: '16px',
                padding: '1.75rem',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.04)',
                border: '1px solid var(--border, #e2e8f0)'
            }}>
                {/* Stepper */}
                {showStepper && (
                    <div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '0.5rem',
                            paddingBottom: '1.5rem',
                            marginBottom: '1rem'
                        }}>
                            {steps.map((step, i) => {
                                const state = getStepState(step, i);
                                return (
                                    <div key={i} style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        flex: 1,
                                        position: 'relative'
                                    }}>
                                        <div style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: state === 'completed' ? '#10b981' : state === 'active' ? '#6366f1' : '#f3f4f6',
                                            color: state === 'pending' ? '#9ca3af' : 'white',
                                            marginBottom: '0.5rem',
                                            zIndex: 1,
                                            transition: 'all 0.3s'
                                        }}>
                                            {state === 'completed' ? <ICONS.CheckCircle size={16} /> :
                                                state === 'active' ? <ICONS.Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> :
                                                    <step.icon size={16} />}
                                        </div>
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            color: 'var(--text-primary, #1e293b)',
                                            textAlign: 'center',
                                            lineHeight: 1.2
                                        }}>
                                            {step.label}
                                        </span>
                                        {i < steps.length - 1 && (
                                            <div style={{
                                                position: 'absolute',
                                                top: 16,
                                                left: '50%',
                                                width: '100%',
                                                height: 2,
                                                background: state === 'completed' ? '#10b981' : '#e5e7eb',
                                                zIndex: 0
                                            }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {isProcessing && (
                            <div style={{
                                padding: '0.85rem 1rem',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
                                border: '1px solid #c7d2fe',
                                marginBottom: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <ICONS.Loader size={16} style={{ color: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6366f1' }}>
                                    {getProcessingSubtext() || "Processing Document..."}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Dropzone */}
                <div>
                    <div
                        onClick={() => !isProcessing && fileInputRef.current.click()}
                        style={{
                            border: '2px dashed #d1d5db',
                            borderRadius: '12px',
                            padding: '3rem 2rem',
                            background: 'var(--dropzone-bg, #f9fafb)',
                            cursor: isProcessing ? 'default' : 'pointer',
                            opacity: isProcessing ? 0.6 : 1,
                            minHeight: '260px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '1rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        <input
                            type="file"
                            hidden
                            ref={fileInputRef}
                            onChange={onFileChange}
                            accept=".pdf"
                        />
                        <ICONS.FileUp size={48} style={{ color: '#6366f1' }} />
                        <div style={{
                            fontSize: '0.875rem',
                            color: 'var(--text-primary, #1e293b)',
                            fontWeight: 500,
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            padding: '0 1rem'
                        }}>
                            {file ? file.name : <>Drag or <span style={{ color: '#6366f1', textDecoration: 'underline' }}>upload file</span> here</>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            Supports PDF files only (Text-based, Password or Scanned)
                        </div>
                    </div>

                    {/* Password Input */}
                    {needsPassword && (
                        <div style={{ marginTop: '2rem' }}>
                            <label style={{
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: 'var(--text-primary, #1e293b)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                marginBottom: '10px'
                            }}>
                                <ICONS.Lock size={14} /> Document Password
                            </label>
                            <input
                                type="password"
                                placeholder="Enter PDF password to unlock extraction..."
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.7rem 0.875rem',
                                    background: 'var(--input-bg, #f9fafb)',
                                    border: '1.5px solid var(--border, #e5e7eb)',
                                    borderRadius: '6px',
                                    fontSize: '0.8125rem',
                                    fontFamily: 'inherit',
                                    color: 'var(--text-primary, #1e293b)'
                                }}
                            />
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div style={{
                            marginTop: '1.5rem',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            padding: '1rem',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            color: '#dc2626',
                            fontSize: '0.85rem',
                            fontWeight: 600
                        }}>
                            <ICONS.AlertCircle size={18} /> {error}
                        </div>
                    )}
                </div>

                {/* Upload Button */}
                <div style={{ marginTop: '1.5rem' }}>
                    <button
                        disabled={!canUpload}
                        onClick={handleUpload}
                        style={{
                            width: '100%',
                            height: '56px',
                            fontSize: '1rem',
                            borderRadius: '12px',
                            background: canUpload ? '#6366f1' : '#e5e7eb',
                            color: canUpload ? 'white' : '#9ca3af',
                            border: 'none',
                            fontWeight: 700,
                            cursor: canUpload ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s',
                            fontFamily: 'inherit'
                        }}
                    >
                        {isProcessing ? (
                            <><ICONS.Loader size={20} style={{ animation: 'spin 0.8s linear infinite' }} /> PROCESSING...</>
                        ) : status === "DONE" ? (
                            <><ICONS.CheckCircle size={20} /> COMPLETED — REDIRECTING...</>
                        ) : (
                            "UPLOAD & START EXTRACTION"
                        )}
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
