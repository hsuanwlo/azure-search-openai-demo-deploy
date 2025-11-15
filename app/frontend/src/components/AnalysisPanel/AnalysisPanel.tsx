import { Stack, Pivot, PivotItem } from "@fluentui/react";
import { useTranslation } from "react-i18next";
import styles from "./AnalysisPanel.module.css";

import { SupportingContent } from "../SupportingContent";
import { ChatAppResponse } from "../../api";
import { AnalysisPanelTabs } from "./AnalysisPanelTabs";
import { ThoughtProcess } from "./ThoughtProcess";
import { MarkdownViewer } from "../MarkdownViewer";
import { useMsal } from "@azure/msal-react";
import { getHeaders } from "../../api";
import { useLogin, getToken } from "../../authConfig";
import { useState, useEffect } from "react";

interface Props {
    className: string;
    activeTab: AnalysisPanelTabs;
    onActiveTabChanged: (tab: AnalysisPanelTabs) => void;
    activeCitation: string | undefined;
    citationHeight: string;
    answer: ChatAppResponse;
}

const pivotItemDisabledStyle = { disabled: true, style: { color: "grey" } };

export const AnalysisPanel = ({ answer, activeTab, activeCitation, citationHeight, className, onActiveTabChanged }: Props) => {
    const isDisabledThoughtProcessTab: boolean = !answer.context.thoughts;
    const isDisabledSupportingContentTab: boolean = !answer.context.data_points;
    const isDisabledCitationTab: boolean = !activeCitation;
    const [citationObjectUrl, setCitationObjectUrl] = useState("");
    const [citationExternalUrl, setCitationExternalUrl] = useState<string | undefined>(undefined);

    const client = useLogin ? useMsal().instance : undefined;
    const { t } = useTranslation();
    const getFileExtension = (path: string) => {
        const withoutQuery = path.split("?")[0];
        const withoutHash = withoutQuery.split("#")[0];
        return withoutHash.split(".").pop()?.toLowerCase();
    };

    useEffect(() => {
        const fetchCitation = async () => {
            const token = client ? await getToken(client) : undefined;

            if (!activeCitation) {
                setCitationExternalUrl(undefined);
                setCitationObjectUrl("");
                return;
            }

            // Get hash from the URL as it may contain #page=N
            // which helps browser PDF renderer jump to correct page N
            const hashIndex = activeCitation.indexOf("#");
            const originalHash = hashIndex !== -1 ? activeCitation.substring(hashIndex + 1) : "";
            const response = await fetch(activeCitation, {
                method: "GET",
                headers: await getHeaders(token)
            });
            const contentType = response.headers.get("Content-Type")?.toLowerCase();
            const fileExtension = getFileExtension(activeCitation);
            const isJsonCitation =
                fileExtension === "json" || (contentType && contentType.includes("application/json"));

            setCitationExternalUrl(undefined);
            setCitationObjectUrl("");

            if (isJsonCitation) {
                try {
                    const citationText = await response.text();
                    const citationJson = JSON.parse(citationText);
                    if (citationJson && typeof citationJson.url === "string") {
                        setCitationExternalUrl(citationJson.url);
                    }
                } catch (error) {
                    console.error("Failed to parse JSON citation", error);
                }
                return;
            }

            const citationContent = await response.blob();
            let citationUrl = URL.createObjectURL(citationContent);
            // Add hash back to the new blob URL
            if (originalHash) {
                citationUrl += "#" + originalHash;
            }
            setCitationObjectUrl(citationUrl);
        };

        fetchCitation();
    }, [activeCitation, client]);

    useEffect(() => {
        return () => {
            if (citationObjectUrl) {
                URL.revokeObjectURL(citationObjectUrl);
            }
        };
    }, [citationObjectUrl]);

    const renderFileViewer = () => {
        if (!activeCitation) {
            return null;
        }

        const fileExtension = getFileExtension(activeCitation);
        if (fileExtension === "json" || citationExternalUrl) {
            return citationExternalUrl ? (
                <a href={citationExternalUrl} target="_blank" rel="noopener noreferrer">
                    {citationExternalUrl}
                </a>
            ) : (
                <div className={styles.citationFallback}>{t("labels.citationUrlUnavailable", "Citation link unavailable.")}</div>
            );
        }

        switch (fileExtension) {
            case "png":
                return <img src={citationObjectUrl} className={styles.citationImg} alt="Citation Image" />;
            case "md":
                return <MarkdownViewer src={activeCitation} />;
            default:
                return <iframe title="Citation" src={citationObjectUrl} width="100%" height={citationHeight} />;
        }
    };

    return (
        <Pivot
            className={className}
            selectedKey={activeTab}
            onLinkClick={pivotItem => pivotItem && onActiveTabChanged(pivotItem.props.itemKey! as AnalysisPanelTabs)}
        >
            <PivotItem
                itemKey={AnalysisPanelTabs.ThoughtProcessTab}
                headerText={t("headerTexts.thoughtProcess")}
                headerButtonProps={isDisabledThoughtProcessTab ? pivotItemDisabledStyle : undefined}
            >
                <ThoughtProcess thoughts={answer.context.thoughts || []} />
            </PivotItem>
            <PivotItem
                itemKey={AnalysisPanelTabs.SupportingContentTab}
                headerText={t("headerTexts.supportingContent")}
                headerButtonProps={isDisabledSupportingContentTab ? pivotItemDisabledStyle : undefined}
            >
                <SupportingContent supportingContent={answer.context.data_points} />
            </PivotItem>
            <PivotItem
                itemKey={AnalysisPanelTabs.CitationTab}
                headerText={t("headerTexts.citation")}
                headerButtonProps={isDisabledCitationTab ? pivotItemDisabledStyle : undefined}
            >
                {renderFileViewer()}
            </PivotItem>
        </Pivot>
    );
};
