"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { PanelLeft } from "@/components/animate-ui/icons/panel-left"
import { PanelRight } from "@/components/animate-ui/icons/panel-right"
import { useSidebar } from "@/components/ui/sidebar"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { AppLogo } from "@/shared/components/app-logo"

export function NavControl() {
  const t = useTranslations("common.navigation")
  const { toggleSidebar, state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div
          className={cn(
            "relative flex h-8 w-full items-center rounded-md text-sm",
          )}
        >
          <Link
            href="/chat"
            aria-label="Chat"
            className={cn(
              "flex min-w-0 items-center overflow-hidden whitespace-nowrap rounded-md pl-2 transition-[max-width,opacity,transform,padding-left] ease-linear outline-hidden ring-sidebar-ring focus-visible:ring-2",
              isCollapsed
                ? "max-w-0 -translate-x-2 pl-0 opacity-0 duration-100"
                : "max-w-[160px] translate-x-0 pl-2 opacity-100 duration-150",
            )}
          >
            <AppLogo
              width={64}
              height={48}
              priority
              className="h-5 w-auto object-contain"
            />
          </Link>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleSidebar}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md transition-[colors,margin-left] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-hidden ring-sidebar-ring focus-visible:ring-2",
                  isCollapsed ? "ml-0" : "ml-auto",
                )}
              >
                {(isCollapsed ? <PanelRight size={18} animateOnHover strokeWidth={1.4} /> : <PanelLeft size={18} animateOnHover strokeWidth={1.4} />)}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" hidden={!isCollapsed}>
              {t("toggleSidebar")}
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
