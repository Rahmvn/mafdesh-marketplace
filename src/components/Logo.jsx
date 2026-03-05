import React from 'react';

export default function Logo({ variant = 'landscape', className = '', style = {} }) {
    const common = { className, style, xmlns: 'http://www.w3.org/2000/svg' };

    if (variant === 'portrait') {
        return (
            <svg width="120" height="120" viewBox="0 0 120 120" {...common}>
                <rect width="120" height="120" rx="18" fill="#ffffff" />
                <circle cx="35" cy="35" r="18" fill="#f97316" />
                <text x="32" y="41" fill="#fff" fontWeight="700" fontSize="12">H</text>
                <text x="60" y="72" fill="#1e3a8a" fontWeight="800" fontSize="20">Mafdesh</text>
            </svg>
        );
    }

    // landscape
    return (
        <svg width="180" height="40" viewBox="0 0 180 40" {...common}>
            <rect width="180" height="40" rx="8" fill="transparent" />
            <circle cx="20" cy="20" r="14" fill="#f97316" />
            <text x="17" y="25" fill="#fff" fontWeight="700" fontSize="12">H</text>
            <text x="44" y="26" fill="#1e40af" fontWeight="800" fontSize="18">Mafdesh</text>
        </svg>
    );
}
