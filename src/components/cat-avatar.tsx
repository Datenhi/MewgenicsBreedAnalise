"use client";

import { useEffect, useState } from "react";
import type { CatAppearance } from "@/lib/mewgenics-parser";
import { renderCatPng } from "@/lib/cat-render-client";

export function CatAvatar({
                              appearance,
                              size = 96,
                              className,
                          }: {
    appearance: CatAppearance | null;
    size?: number;
    className?: string;
}) {
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!appearance) {
            setUrl(null);
            return;
        }
        let alive = true;
        const palette =
            appearance.classPalette >= 0 && appearance.classPalette < 256
                ? appearance.classPalette
                : appearance.palette;
        renderCatPng({
            texture: appearance.texture,
            palette,
            body: appearance.body.shape,
            head: appearance.head.shape,
            tail: appearance.tail.shape,
            legL: appearance.legL.shape,
            legR: appearance.legR.shape,
            armL: appearance.armL.shape,
            armR: appearance.armR.shape,
            earL: appearance.earL.shape,
            earR: appearance.earR.shape,
            eyeL: appearance.eyeL.shape,
            eyeR: appearance.eyeR.shape,
            browL: appearance.browL.shape,
            browR: appearance.browR.shape,
            mouth: appearance.mouth.shape,
        })
            .then((u) => {
                if (!alive) return;
                setUrl(u);
                setFailed(false);
            })
            .catch(() => {
                if (alive) setFailed(true);
            });
        return () => {
            alive = false;
        };
    }, [appearance]);

    if (!appearance || (failed && !url)) {
        return (
            <svg
                viewBox="-50 -50 100 100"
                width={size}
                height={size}
                className={className}
                aria-hidden
            >
                <g fill="currentColor" opacity="0.25">
                    <ellipse cx="0" cy="12" rx="26" ry="20" />
                    <circle cx="0" cy="-16" r="18" />
                    <path d="M-16 -28 L-12 -44 L-4 -30 Z" />
                    <path d="M16 -28 L12 -44 L4 -30 Z" />
                </g>
            </svg>
        );
    }

    if (!url) {
        return (
            <div
                className={className}
                style={{ width: size, height: size }}
                aria-hidden
            />
        );
    }

    return (
        <img
            src={url}
            width={size}
            height={size}
            className={className}
            style={{ width: size, height: size, objectFit: "contain" }}
            alt=""
            draggable={false}
        />
    );
}