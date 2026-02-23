// src/components/ui/date-picker-with-presets.tsx
"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DatePickerWithPresetsProps {
    onSelect: (date?: Date) => void;
    initialDate?: Date;
}

export function DatePickerWithPresets({ onSelect, initialDate }: DatePickerWithPresetsProps) {
  const [date, setDate] = React.useState<Date | undefined>(initialDate)

  React.useEffect(() => {
    onSelect(date);
  }, [date, onSelect]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-[280px] justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col space-y-2 p-2">
        <Select
          onValueChange={(value) =>
            setDate(new Date(new Date().setDate(new Date().getDate() + parseInt(value))))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a preset..." />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="0">Today</SelectItem>
            <SelectItem value="-1">Yesterday</SelectItem>
            <SelectItem value="-7">A week ago</SelectItem>
          </SelectContent>
        </Select>
        <div className="rounded-md border">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            initialFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
