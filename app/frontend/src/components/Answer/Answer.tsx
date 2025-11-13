import { useEffect, useMemo, useState } from "react";
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
    const parsedAnswer = useMemo(() => parseAnswerToHtml(answer, isStreaming, onCitationClicked), [answer]);
    const { t } = useTranslation();
    const sanitizedAnswerHtml = DOMPurify.sanitize(parsedAnswer.answerHtml);
    const [copied, setCopied] = useState(false);
    const [citationUrls, setCitationUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!parsedAnswer.citations.length || isStreaming) {
            setCitationUrls({});
            return;
        }

        const abortController = new AbortController();
        let isActive = true;

        const fetchCitationUrls = async () => {
            const entries = await Promise.all(
                parsedAnswer.citations.map(async citation => {
                    const path = getCitationFilePath(citation);
                    const strippedPath = path.replace(/\([^)]*\)$/, "");

                    try {
                        const response = await fetch(strippedPath, { signal: abortController.signal });
                        if (!response.ok) {
                            return [citation, ""] as const;
                        }

                        const contentType = response.headers.get("content-type") || "";
                        if (contentType.includes("application/json")) {
                            const data = await response.json();
                            if (data?.url && typeof data.url === "string") {
                                return [citation, data.url] as const;
                            }
                        } else {
                            const text = await response.text();
                            try {
                                const data = JSON.parse(text);
                                if (data?.url && typeof data.url === "string") {
                                    return [citation, data.url] as const;
                                }
                            } catch (error) {
                                console.warn("Unable to parse citation JSON", error);
                            }
                        }
                    } catch (error) {
                        if ((error as DOMException).name === "AbortError") {
                            return [citation, ""] as const;
                        }
                        console.warn("Failed to fetch citation", error);
                    }

                    return [citation, ""] as const;
                })
            );

            if (!isActive) {
                return;
            }

            const urlMap: Record<string, string> = {};
            entries.forEach(([citation, url]) => {
                if (url) {
                    urlMap[citation] = url;
                }
            });
            setCitationUrls(urlMap);
        };

        fetchCitationUrls();

        return () => {
            isActive = false;
            abortController.abort();
        };
    }, [isStreaming, parsedAnswer.citations]);

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
                            const path = getCitationFilePath(x);
                            // Strip out the image filename in parentheses if it exists
                            const strippedPath = path.replace(/\([^)]*\)$/, "");
                            const citationUrl = citationUrls[x];
                            const displayIndex = i + 1;
                            if (citationUrl) {
                                return (
                                    <a
                                        key={i}
                                        className={styles.citation}
                                        title={citationUrl}
                                        href={citationUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {`${displayIndex}. ${citationUrl}`}
                                    </a>
                                );
                            }
                            return (
                                <a key={i} className={styles.citation} title={x} onClick={() => onCitationClicked(strippedPath)}>
                                    {`${displayIndex}. ${x}`}
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
