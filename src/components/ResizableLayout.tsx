import React, { useState, useRef, useEffect } from 'react';
import './ResizableLayout.css';

interface Props {
    top: React.ReactNode;
    bottom: React.ReactNode;
    initialTopHeightPercentage?: number; // 0-100
}

export const ResizableLayout: React.FC<Props> = ({ top, bottom, initialTopHeightPercentage = 40 }) => {
    const [topHeight, setTopHeight] = useState(initialTopHeightPercentage);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const relativeY = e.clientY - containerRect.top;
            let newPercentage = (relativeY / containerRect.height) * 100;

            // Clamp between 20% and 80% to prevent total collapse
            newPercentage = Math.min(Math.max(newPercentage, 20), 80);

            setTopHeight(newPercentage);
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <div className="resizable-container" ref={containerRef}>
            <div className="resizable-top" style={{ height: `${topHeight}%` }}>
                {top}
            </div>

            <div className="resize-handle" onMouseDown={handleMouseDown}>
                <div className="handle-bar"></div>
            </div>

            <div className="resizable-bottom" style={{ height: `${100 - topHeight}%` }}>
                {bottom}
            </div>
        </div>
    );
};
