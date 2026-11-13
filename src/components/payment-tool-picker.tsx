import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PaymentToolOption = { value: string; label: string; detail?: string; searchText?: string };

export function PaymentToolPicker({ id, label, placeholder, searchPlaceholder, value, onChange, options, disabled, emptyText }: {
  id: string;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  value: string;
  onChange: (value: string) => void;
  options: PaymentToolOption[];
  disabled?: boolean;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find(option => option.value === value);
  const filtered = options.filter(option => `${option.label} ${option.detail ?? ""} ${option.searchText ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" role="combobox" aria-label={label} aria-expanded={open} variant="outline" disabled={disabled}
          className="h-auto min-h-12 w-full justify-between gap-3 whitespace-normal px-3 py-2.5 text-left font-normal">
          <span className="min-w-0">
            <span className={cn("block break-words text-sm", selected ? "font-semibold text-foreground" : "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
            {selected?.detail && <span className="mt-0.5 block break-words text-xs text-muted-foreground">{selected.detail}</span>}
          </span>
          <ChevronDown className="shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" onOpenAutoFocus={event => event.preventDefault()}>
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-5 top-5 h-4 w-4 text-muted-foreground" />
          <Input autoFocus aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)} className="h-10 pl-9" />
        </div>
        <div role="listbox" aria-label={label} className="max-h-60 overflow-y-auto p-1">
          {filtered.map(option => (
            <Button key={option.value} role="option" aria-selected={value === option.value} type="button" variant="ghost"
              className="h-auto min-h-12 w-full justify-between gap-2 whitespace-normal px-3 py-2.5 text-left font-normal"
              onClick={() => { onChange(option.value); setOpen(false); setSearch(""); }}>
              <span className="min-w-0"><span className="block break-words text-sm font-semibold">{option.label}</span>{option.detail && <span className="mt-0.5 block break-words text-xs text-muted-foreground">{option.detail}</span>}</span>
              {value === option.value && <Check className="shrink-0 text-accent-foreground" />}
            </Button>
          ))}
          {!filtered.length && <p className="px-3 py-5 text-sm text-muted-foreground">{search ? "Koi matching result nahi mila." : emptyText}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}