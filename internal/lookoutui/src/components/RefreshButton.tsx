import { useEffect, useRef, useState } from "react"

import { Refresh } from "@mui/icons-material"
import { CircularProgress, IconButton, Typography } from "@mui/material"

import "./RefreshButton.css"

type RefreshButtonProps = {
  isLoading: boolean
  onClick: () => void
}

export default function RefreshButton(props: RefreshButtonProps) {
  const [lastRefreshed, setLastRefreshed] = useState<Date | undefined>(undefined)
  const prevIsLoading = useRef(props.isLoading)

  useEffect(() => {
    if (prevIsLoading.current && !props.isLoading) {
      setLastRefreshed(new Date())
    }
    prevIsLoading.current = props.isLoading
  }, [props.isLoading])

  return (
    <div className="refresh">
      {props.isLoading ? (
        <CircularProgress size={20} />
      ) : (
        <IconButton title={"Refresh"} onClick={props.onClick} color={"primary"} size="small">
          <Refresh />
        </IconButton>
      )}
      {lastRefreshed && (
        <Typography variant="caption" className="refresh-time">
          Updated {lastRefreshed.toLocaleTimeString()}
        </Typography>
      )}
    </div>
  )
}
