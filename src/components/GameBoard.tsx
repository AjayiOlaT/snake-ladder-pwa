'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

export const RAW_CONFIGS: Record<string, Record<number, { type: string, target?: number, modifier?: number }>> = {
  easy: {
    3: { type: 'ladder', target: 12 },
    10: { type: 'ladder', target: 21 },
    16: { type: 'ladder', target: 25 },
    14: { type: 'snake', target: 6 },
    24: { type: 'snake', target: 11 },
    28: { type: 'snake', target: 4 },
    8: { type: 'modifier', modifier: 2 },
    18: { type: 'modifier', modifier: -3 }
  },
  medium: {
    16: { type: 'snake', target: 5 },
    29: { type: 'snake', target: 11 },
    45: { type: 'snake', target: 24 },
    48: { type: 'snake', target: 32 },
    8: { type: 'ladder', target: 17 },
    21: { type: 'ladder', target: 42 },
    33: { type: 'ladder', target: 44 },
    14: { type: 'modifier', modifier: 3 },
    38: { type: 'modifier', modifier: -5 }
  },
  hard: {
    15: { type: 'snake', target: 6 },
    46: { type: 'snake', target: 25 },
    49: { type: 'snake', target: 11 },
    56: { type: 'snake', target: 53 },
    62: { type: 'snake', target: 19 },
    87: { type: 'snake', target: 24 },
    93: { type: 'snake', target: 73 },
    98: { type: 'snake', target: 78 },
    1: { type: 'ladder', target: 38 },
    4: { type: 'ladder', target: 14 },
    9: { type: 'ladder', target: 31 },
    21: { type: 'ladder', target: 42 },
    28: { type: 'ladder', target: 84 },
    36: { type: 'ladder', target: 44 },
    51: { type: 'ladder', target: 67 },
    71: { type: 'ladder', target: 91 },
    80: { type: 'ladder', target: 99 },
    33: { type: 'modifier', modifier: 4 },
    75: { type: 'modifier', modifier: -6 }
  }
};

const getCenterPosition = (cellIndex: number, cols: number, rows: number) => {
    const rowFromBottom = Math.floor(cellIndex / cols);
    const rowFromTop = (rows - 1) - rowFromBottom;
    const colFromLeft = rowFromBottom % 2 === 0 ? (cellIndex % cols) : ((cols - 1) - (cellIndex % cols));

    const x = colFromLeft * (100 / cols) + (100 / (cols * 2));
    const y = rowFromTop * (100 / rows) + (100 / (rows * 2));
    return { x, y };
};

export default function GameBoard({ player1Pos, player2Pos, difficulty = 'easy' }: { player1Pos: number; player2Pos: number; difficulty?: string }) {
  
  const { cols, rows, target, config } = useMemo(() => {
       if (difficulty === 'hard') return { cols: 10, rows: 10, target: 99, config: RAW_CONFIGS.hard };
       if (difficulty === 'medium') return { cols: 10, rows: 5, target: 49, config: RAW_CONFIGS.medium };
       return { cols: 6, rows: 5, target: 29, config: RAW_CONFIGS.easy };
  }, [difficulty]);

  const layout = useMemo(() => {
    const arr = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push(r * cols + c);
      }
      if (r % 2 === 1) row.reverse();
      arr.unshift(...row); 
    }
    return arr;
  }, [cols, rows]);

  const connections = useMemo(() => {
     const elements: React.ReactNode[] = [];
     Object.entries(config).forEach(([key, cfg]) => {
         const startIndex = parseInt(key);
         if (cfg.target !== undefined) {
             const start = getCenterPosition(startIndex, cols, rows);
             const end = getCenterPosition(cfg.target, cols, rows);
             
             if (cfg.type === 'ladder') {
                 const dx = end.x - start.x;
                 const dy = end.y - start.y;
                 const L = Math.sqrt(dx*dx + dy*dy);
                 
                 const ux = dx/L; const uy = dy/L;
                 const px = -uy;  const py = ux;
                 
                 // Dynamic ladder width scales inversely to board density
                 const w = difficulty === 'hard' ? 1.5 : 2.5; 
                 
                 const lx1 = start.x + px*w; const ly1 = start.y + py*w;
                 const lx2 = end.x + px*w; const ly2 = end.y + py*w;
                 const rx1 = start.x - px*w; const ry1 = start.y - py*w;
                 const rx2 = end.x - px*w; const ry2 = end.y - py*w;
                 
                 elements.push(<line key={`l1-${startIndex}`} x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#78350f" strokeWidth={difficulty === 'hard'? "1.0":"1.5"} strokeLinecap="round" className="opacity-100 shadow-xl drop-shadow-md" />);
                 elements.push(<line key={`l2-${startIndex}`} x1={rx1} y1={ry1} x2={rx2} y2={ry2} stroke="#78350f" strokeWidth={difficulty === 'hard'? "1.0":"1.5"} strokeLinecap="round" className="opacity-100 shadow-xl drop-shadow-md" />);
                 
                 const rungsCount = Math.floor(L / (difficulty === 'hard' ? 3 : 4.5)); 
                 for(let i = 1; i <= rungsCount; i++) {
                     const rX = start.x + dx * (i/(rungsCount+1));
                     const rY = start.y + dy * (i/(rungsCount+1));
                     elements.push(<line key={`rung-${startIndex}-${i}`} x1={rX+px*w} y1={rY+py*w} x2={rX-px*w} y2={rY-py*w} stroke="#92400e" strokeWidth={difficulty==='hard'?"0.8":"1.2"} strokeLinecap="round" className="opacity-90 drop-shadow-sm" />);
                 }
             } else if (cfg.type === 'snake') {
                 const dx = end.x - start.x;
                 const dy = end.y - start.y;
                 
                 const px = -dy * 0.4; 
                 const py = dx * 0.4; 
                 
                 const mx1 = start.x + dx*0.33 + px;
                 const my1 = start.y + dy*0.33 + py;
                 const mx2 = start.x + dx*0.66 - px;
                 const my2 = start.y + dy*0.66 - py;
                 
                 const pathData = `M ${start.x} ${start.y} C ${mx1} ${my1}, ${mx2} ${my2}, ${end.x} ${end.y}`;
                 
                 const bodyWidth = difficulty === 'hard' ? "2" : "3.5";

                 elements.push(
                     <path 
                        key={`snake-body-${startIndex}`}
                        d={pathData}
                        stroke="#14532d" strokeWidth={bodyWidth} fill="transparent" strokeLinecap="round"
                        className="drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)]"
                     />
                 );
                 elements.push(
                     <path 
                        key={`snake-pattern-${startIndex}`}
                        d={pathData}
                        stroke="#eab308" strokeWidth="0.8" strokeDasharray="2 3" fill="transparent" strokeLinecap="round"
                     />
                 );

                 const headAngle = Math.atan2(start.y - my1, start.x - mx1) * (180 / Math.PI);
                 const scaleX = difficulty === 'hard' ? 0.7 : 1;
                 
                 elements.push(
                     <g key={`head-${startIndex}`} transform={`translate(${start.x}, ${start.y}) rotate(${headAngle}) scale(${scaleX})`} className="drop-shadow-lg">
                         <path d="M 0 0 L -3.5 -1 M 0 0 L -3.5 1" stroke="#ef4444" strokeWidth="0.4" fill="transparent" />
                         <ellipse cx="0" cy="0" rx="3" ry="2" fill="#14532d" />
                         <circle cx="-0.5" cy="-1.2" r="0.8" fill="#eab308" />
                         <circle cx="-0.5" cy="1.2" r="0.8" fill="#eab308" />
                         <circle cx="-1" cy="-1.2" r="0.3" fill="black" />
                         <circle cx="-1" cy="1.2" r="0.3" fill="black" />
                     </g>
                 );
             }
         }
     });
     return elements;
  }, [config, cols, rows, difficulty]);

  return (
    <div className="relative w-full max-w-4xl mx-auto rounded-3xl p-4 sm:p-6 bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]">
      
      <div 
        className="grid w-full gap-1 sm:gap-2 relative z-0" 
        style={{ 
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            aspectRatio: `${cols} / ${rows}`
        }}
      >
        
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
            {connections}
        </svg>

        {layout.map((cellIndex) => {
          const cfg = config[cellIndex];
          const isWinner = cellIndex === target;
          
          return (
            <div 
              key={`cell-${cellIndex}`}
              className={`relative flex flex-col items-center justify-center rounded-xl bg-white/5 border overflow-visible shadow-inner transition-colors duration-500 hover:bg-white/10 ${isWinner ? 'border-yellow-400/50 bg-yellow-400/20' : 'border-white/10'}`}
            >
              <span className="absolute top-1 left-1.5 sm:top-1 sm:left-2 text-[8px] sm:text-[10px] font-bold text-white/40">{cellIndex}</span>
              
              {isWinner && <div className={`${difficulty==='hard'?'text-2xl':'text-4xl'} sm:text-4xl drop-shadow-[0_0_15px_rgba(250,204,21,1)] z-20 animate-pulse`}>👑</div>}
              {cfg?.type === 'modifier' && (
                <div className={`text-amber-400 font-bold ${difficulty === 'hard'?'text-[10px] px-1 ':'text-xs sm:text-sm px-2 sm:px-3 '} py-0.5 sm:py-1 bg-amber-400/20 rounded-full z-20 shadow-md border border-amber-400/50`}>
                  {cfg.modifier! > 0 ? '+' : ''}{cfg.modifier}
                </div>
              )}
            </div>
          );
        })}

        <PlayerPiece playerIndex={1} cellIndex={player1Pos} color="bg-indigo-500" cols={cols} rows={rows} diff={difficulty} />
        <PlayerPiece playerIndex={2} cellIndex={player2Pos} color="bg-cyan-400" cols={cols} rows={rows} diff={difficulty} />

      </div>

    </div>
  );
}

const PlayerPiece = ({ playerIndex, cellIndex, color, cols, rows, diff }: { playerIndex: number, cellIndex: number, color: string, cols: number, rows: number, diff: string }) => {
    const pt = getCenterPosition(cellIndex, cols, rows);
    const isDense = cols >= 10;
    const sizeOffsets = isDense ? 'w-5 h-5 sm:w-6 sm:h-6 -ml-2.5 -mt-2.5 sm:-ml-3 sm:-mt-3' : 'w-8 h-8 sm:w-10 sm:h-10 -ml-4 -mt-4 sm:-ml-5 sm:-mt-5';
    const translateClass = playerIndex === 2 ? (isDense ? 'translate-x-[0.35rem] translate-y-[0.35rem] sm:translate-x-2 sm:translate-y-2' : 'translate-x-4 translate-y-4') : '';

    return (
        <motion.div
           initial={{ left: '0%', top: '100%' }}
           animate={{ left: `${pt.x}%`, top: `${pt.y}%` }}
           transition={{ type: "spring", stiffness: 100, damping: 14 }}
           className={`absolute ${sizeOffsets} pointer-events-none z-${20 + playerIndex}`}
        >
            <div className={`w-full h-full rounded-full ${color} shadow-[0_0_20px_rgba(255,255,255,0.6)] border-2 border-white/80 shadow-inner flex items-center justify-center transform transition-transform duration-300 ${translateClass}`}>
               <div className="w-1/2 h-1/2 rounded-full bg-white/50 backdrop-blur-md" />
            </div>
        </motion.div>
    );
};
