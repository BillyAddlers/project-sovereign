"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface DependencyOption {
  id: string;
  title: string;
}

interface DependencyPickerProps {
  /** Tasks that may become prerequisites (already limited to the project). */
  candidates: DependencyOption[];
  selected: DependencyOption[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  hint?: string;
}

/** Chips + select, shared by the create form and the PM edit panel. */
export function DependencyPicker({
  candidates,
  selected,
  onAdd,
  onRemove,
  disabled = false,
  hint,
}: DependencyPickerProps) {
  const [chosen, setChosen] = useState("");
  const selectedIds = new Set(selected.map((item) => item.id));
  const available = candidates.filter((candidate) => !selectedIds.has(candidate.id));

  return (
    <div className="space-y-2">
      <Label>Prerequisites</Label>
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}

      {selected.length === 0 ? (
        <p className="text-muted-foreground text-sm">None — this task can start immediately.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-full border border-black/5 bg-white/60 px-3 py-1 text-sm dark:border-white/10 dark:bg-white/[0.08]"
            >
              <span>{item.title}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                disabled={disabled}
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.title}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <select
          className="border-input h-9 min-w-0 flex-1 rounded-md border bg-white/60 px-2 text-sm dark:bg-white/[0.07]"
          value={chosen}
          disabled={disabled || available.length === 0}
          onChange={(event) => setChosen(event.target.value)}
        >
          <option value="">
            {available.length === 0 ? "No more tasks to add" : "Add prerequisite…"}
          </option>
          {available.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={!chosen || disabled}
          onClick={() => {
            onAdd(chosen);
            setChosen("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
