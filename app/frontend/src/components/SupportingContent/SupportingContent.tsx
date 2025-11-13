import { useEffect, useMemo, useState } from "react";

import { getCitationFilePath } from "../../api";
import { parseSupportingContentItem } from "./SupportingContentParser";

import styles from "./SupportingContent.module.css";

interface Props {
    supportingContent: string[] | { text: string[]; images?: string[] };
}

export const SupportingContent = ({ supportingContent }: Props) => {
    const textItems = Array.isArray(supportingContent) ? supportingContent : supportingContent.text;
    const imageItems = !Array.isArray(supportingContent) ? supportingContent?.images : [];
    const parsedTextItems = useMemo(() => textItems.map(item => parseSupportingContentItem(item)), [textItems]);
    const [citationLinks, setCitationLinks] = useState<Record<string, string | null>>({});

    useEffect(() => {
        let isMounted = true;

        const loadCitationLinks = async () => {
            const citationFiles = Array.from(
                new Set(
                    parsedTextItems
                        .map(item => item.title.trim())
                        .filter(title => title.toLowerCase().endsWith(".json"))
                )
            );

            if (!citationFiles.length) {
                setCitationLinks({});
                return;
            }

            setCitationLinks({});

            const entries = await Promise.all(
                citationFiles.map(async fileName => {
                    try {
                        const response = await fetch(getCitationFilePath(fileName));
                        if (!response.ok) {
                            return [fileName, null] as const;
                        }

                        const { url } = (await response.json()) as { url: string };
                        return [fileName, url.trim()] as const;
                    } catch (error) {
                        console.error(`Unable to load citation link for ${fileName}`, error);
                        return [fileName, null] as const;
                    }
                })
            );

            if (isMounted) {
                setCitationLinks(Object.fromEntries(entries));
            }
        };

        loadCitationLinks();

        return () => {
            isMounted = false;
        };
    }, [parsedTextItems]);

    return (
        <ul className={styles.supportingContentNavList}>
            {parsedTextItems.map((parsed, ind) => {
                const title = parsed.title.trim();
                const citationUrl = citationLinks[title];
                return (
                    <li className={styles.supportingContentItem} key={`supporting-content-text-${ind}`}>
                        <h4 className={styles.supportingContentItemHeader}>
                            {citationUrl === null ? (
                                <span>{parsed.title} (link unavailable)</span>
                            ) : citationUrl ? (
                                <a href={citationUrl} target="_blank" rel="noopener noreferrer">
                                    {parsed.title}
                                </a>
                            ) : (
                                <span>{parsed.title} (loading link…)</span>
                            )}
                        </h4>
                        <p className={styles.supportingContentItemText} dangerouslySetInnerHTML={{ __html: parsed.content }} />
                    </li>
                );
            })}
            {imageItems?.map((img, ind) => {
                return (
                    <li className={styles.supportingContentItem} key={`supporting-content-image-${ind}`}>
                        <img className={styles.supportingContentItemImage} src={img} />
                    </li>
                );
            })}
        </ul>
    );
};
