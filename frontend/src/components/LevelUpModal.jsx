import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function LevelUpModal({ open, upgrades, onChoose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          data-testid="levelup-modal"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="parchment-card max-w-2xl w-full p-10 relative"
          >
            <div className="absolute top-3 left-3 text-dungeon-dark/60 font-sub text-xs">✦</div>
            <div className="absolute top-3 right-3 text-dungeon-dark/60 font-sub text-xs">✦</div>
            <p className="text-center font-sub text-dungeon-dark/70 text-sm tracking-widest uppercase">
              An echo answers your deeds
            </p>
            <h2 className="text-center font-heading text-4xl mt-2 text-dungeon-dark tracking-widest uppercase">
              Level Up
            </h2>
            <p className="text-center font-body italic text-dungeon-dark/70 mt-2">
              Choose a boon carved into the stones of your resolve.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 mt-8">
              {upgrades.map((u, i) => (
                <button
                  key={u.id + i}
                  onClick={() => onChoose(u)}
                  className="text-left p-5 border border-dungeon-dark/30 bg-[#f0e3c8] hover:bg-[#f8edd3] hover:border-dungeon-blood hover:shadow-[inset_0_0_20px_rgba(140,28,19,0.25)] transition-all"
                  data-testid={`levelup-choice-${i}`}
                >
                  <div className="font-heading text-sm tracking-widest uppercase text-dungeon-blood">
                    {u.name}
                  </div>
                  <div className="font-body text-sm text-dungeon-dark/80 mt-2 leading-relaxed">
                    {u.desc}
                  </div>
                  <div className="mt-4 text-xs font-sub text-dungeon-dark/60">
                    Press {i + 1}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
