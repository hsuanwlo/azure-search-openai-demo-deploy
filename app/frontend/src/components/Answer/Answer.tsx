import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, IconButton } from "@fluentui/react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import styles from "./Answer.module.css";
import { ChatAppResponse, getCitationFilePath, SpeechConfig } from "../../api";
import { parseAnswerToHtml } from "./AnswerParser";
import { AnswerIcon } from "./AnswerIcon";
import { SpeechOutputBrowser } from "./SpeechOutputBrowser";
import { SpeechOutputAzure } from "./SpeechOutputAzure";

interface Props {
    answer: ChatAppResponse;
    index: number;
    speechConfig: SpeechConfig;
    isSelected?: boolean;
    isStreaming: boolean;
    onCitationClicked: (filePath: string) => void;
    onThoughtProcessClicked: () => void;
    onSupportingContentClicked: () => void;
    onFollowupQuestionClicked?: (question: string) => void;
    showFollowupQuestions?: boolean;
    showSpeechOutputBrowser?: boolean;
    showSpeechOutputAzure?: boolean;
}

export const Answer = ({
    answer,
    index,
    speechConfig,
    isSelected,
    isStreaming,
    onCitationClicked,
    onThoughtProcessClicked,
    onSupportingContentClicked,
    onFollowupQuestionClicked,
    showFollowupQuestions,
    showSpeechOutputAzure,
    showSpeechOutputBrowser
}: Props) => {
    const followupQuestions = answer.context?.followup_questions;
    const [citationLinks, setCitationLinks] = useState<Record<string, string>>({});

    const handleCitationClick = useCallback(
        (citation: string, citationPath: string) => {
            const citationUrl = citationLinks[citation];

            if (citationUrl) {
                window.open(citationUrl, "_blank", "noopener,noreferrer");
                return;
            }

            onCitationClicked(citationPath);
        },
        [citationLinks, onCitationClicked]
    );

    const parsedAnswer = useMemo(
        () => parseAnswerToHtml(answer, isStreaming, handleCitationClick),
        [answer, handleCitationClick, isStreaming]
    );
    const citationsSignature = useMemo(
        () => parsedAnswer.citations.join("||"),
        [parsedAnswer.citations]
    );
    const { t } = useTranslation();
    const sanitizedAnswerHtml = DOMPurify.sanitize(parsedAnswer.answerHtml);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let isActive = true;
        const abortController = new AbortController();

        const extractUrlFromJson = (data: any): string | undefined => {
            if (!data) {
                return undefined;
            }

            if (typeof data === "string") {
                try {
                    const parsed = JSON.parse(data);
                    return extractUrlFromJson(parsed);
                } catch (err) {
                    return /^https?:\/\//i.test(data.trim()) ? data.trim() : undefined;
                }
            }

            if (Array.isArray(data)) {
                for (const item of data) {
                    const url = extractUrlFromJson(item);
                    if (url) {
                        return url;
                    }
                }
                return undefined;
            }

            if (typeof data === "object") {
                for (const [key, value] of Object.entries(data)) {
                    if (typeof value === "string" && key.toLowerCase() === "url" && /^https?:\/\//i.test(value.trim())) {
                        return value.trim();
                    }

                    const nestedUrl = extractUrlFromJson(value);
                    if (nestedUrl) {
                        return nestedUrl;
                    }
                }
            }

            return undefined;
        };

        const loadCitationLinks = async () => {
            if (!parsedAnswer.citations.length) {
                if (isActive) {
                    setCitationLinks(prev =>
                        Object.keys(prev).length ? ({} as Record<string, string>) : prev
                    );
                }
                return;
            }

            const entries = await Promise.all(
                parsedAnswer.citations.map(async citation => {
                    const normalizedCitation = citation.split("#")[0]?.trim().toLowerCase();
                    if (!normalizedCitation?.endsWith(".json")) {
                        return undefined;
                    }

                    try {
                        const response = await fetch(getCitationFilePath(citation), { signal: abortController.signal });
                        if (!response.ok) {
                            return undefined;
                        }

                        let jsonData: any;

                        try {
                            jsonData = await response.clone().json();
                        } catch (err) {
                            const text = await response.text();
                            jsonData = JSON.parse(text);
                        }

                        const url = extractUrlFromJson(jsonData);
                        if (url) {
                            return [citation, url] as const;
                        }
                    } catch (err: any) {
                        if (err?.name === "AbortError") {
                            return undefined;
                        }
                    }

                    return undefined;
                })
            );

            if (!isActive) {
                return;
            }

            const links: Record<string, string> = {};
            entries.forEach(entry => {
                if (entry) {
                    const [citation, url] = entry;
                    links[citation] = url;
                }
            });

            setCitationLinks(prev => {
                const prevKeys = Object.keys(prev);
                const nextKeys = Object.keys(links);

                if (prevKeys.length !== nextKeys.length) {
                    return links;
                }

                for (const key of nextKeys) {
                    if (prev[key] !== links[key]) {
                        return links;
                    }
                }

                return prev;
            });
        };

        loadCitationLinks();

        return () => {
            isActive = false;
            abortController.abort();
        };
    }, [citationsSignature]);

    const handleCopy = () => {
        // Single replace to remove all HTML tags to remove the citations
        const textToCopy = sanitizedAnswerHtml.replace(/<a [^>]*><sup>\d+<\/sup><\/a>|<[^>]+>/g, "");

        navigator.clipboard
            .writeText(textToCopy)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(err => console.error("Failed to copy text: ", err));
    };

    return (
        <Stack className={`${styles.answerContainer} ${isSelected && styles.selected}`} verticalAlign="space-between">
            <Stack.Item>
                <Stack horizontal horizontalAlign="space-between">
                    <AnswerIcon />
                    <div>
                        <IconButton
                            style={{ color: "black" }}
                            iconProps={{ iconName: copied ? "CheckMark" : "Copy" }}
                            title={copied ? t("tooltips.copied") : t("tooltips.copy")}
                            ariaLabel={copied ? t("tooltips.copied") : t("tooltips.copy")}
                            onClick={handleCopy}
                        />
                        <IconButton
                            style={{ color: "black" }}
                            iconProps={{ iconName: "Lightbulb" }}
                            title={t("tooltips.showThoughtProcess")}
                            ariaLabel={t("tooltips.showThoughtProcess")}
                            onClick={() => onThoughtProcessClicked()}
                            disabled={!answer.context.thoughts?.length || isStreaming}
                        />
                        <IconButton
                            style={{ color: "black" }}
                            iconProps={{ iconName: "ClipboardList" }}
                            title={t("tooltips.showSupportingContent")}
                            ariaLabel={t("tooltips.showSupportingContent")}
                            onClick={() => onSupportingContentClicked()}
                            disabled={!answer.context.data_points || isStreaming}
                        />
                        {showSpeechOutputAzure && (
                            <SpeechOutputAzure answer={sanitizedAnswerHtml} index={index} speechConfig={speechConfig} isStreaming={isStreaming} />
                        )}
                        {showSpeechOutputBrowser && <SpeechOutputBrowser answer={sanitizedAnswerHtml} />}
                    </div>
                </Stack>
            </Stack.Item>

            <Stack.Item grow>
                <div className={styles.answerText}>
                    <ReactMarkdown children={sanitizedAnswerHtml} rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]} />
                </div>
            </Stack.Item>

            {!!parsedAnswer.citations.length && (
                <Stack.Item>
                    <Stack horizontal wrap tokens={{ childrenGap: 5 }}>
                        <span className={styles.citationLearnMore}>{t("citationWithColon")}</span>
                        {parsedAnswer.citations.map((x, i) => {
                            const displayNumber = i + 1;
                            const citationPath = getCitationFilePath(x);
                            const strippedPath = citationPath.replace(/\([^)]*\)$/, "");
                            const displayText = citationLinks[x] ?? x;

                            return (
                                <a
                                    key={`${x}-${i}`}
                                    className={styles.citation}
                                    title={displayText}
                                    onClick={() => handleCitationClick(x, strippedPath)}
                                >
                                    {`${displayNumber}. ${displayText}`}
                                </a>
                            );
                        })}
                    </Stack>
                </Stack.Item>
            )}

            {!!followupQuestions?.length && showFollowupQuestions && onFollowupQuestionClicked && (
                <Stack.Item>
                    <Stack horizontal wrap className={`${!!parsedAnswer.citations.length ? styles.followupQuestionsList : ""}`} tokens={{ childrenGap: 6 }}>
                        <span className={styles.followupQuestionLearnMore}>{t("followupQuestions")}</span>
                        {followupQuestions.map((x, i) => {
                            return (
                                <a key={i} className={styles.followupQuestion} title={x} onClick={() => onFollowupQuestionClicked(x)}>
                                    {`${x}`}
                                </a>
                            );
                        })}
                    </Stack>
                </Stack.Item>
            )}
        </Stack>
    );
};
