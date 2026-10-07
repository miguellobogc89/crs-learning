// components/academy/academy-create-course-action.tsx

"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export const ACADEMY_CREATE_COURSE_EVENT =
  "crs:academy-create-course";

export function AcademyCreateCourseAction() {
  return (
    <Button
      size="lg"
      className="gap-2 bg-[#315BFF] px-4 text-white hover:bg-[#244BE8]"
      onClick={() => {
        window.dispatchEvent(
          new Event(
            ACADEMY_CREATE_COURSE_EVENT,
          ),
        );
      }}
    >
      <Plus className="h-4 w-4" />
      Crear curso
    </Button>
  );
}