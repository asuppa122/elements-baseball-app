# Elements Baseball Architecture

## Stack

- React + TypeScript + Vite
- Supabase authentication, database, and current image storage
- Discord OAuth
- GitHub source control
- Vercel hosting

## Main Application Areas

- Authentication and manager claiming
- Public Demo Mode
- Cards and card profiles
- Team Builder
- Future modules: Trades, Season Milestones, Play, Standings, Statistics, and Rules

## Shared Behavior

Production and Demo Mode use the same components and responsive layouts. Demo Mode changes data access and persistence behavior rather than maintaining a second website.

## Development Workflow

Each delivered ZIP is a complete runnable project. Major releases are versioned and should be tested locally on production and `/demo` routes before pushing to GitHub/Vercel.
