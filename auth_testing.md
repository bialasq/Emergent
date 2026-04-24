# Auth Testing Playbook — Dungeon of Echoes

## Step 1 — MongoDB verification
```
mongosh
use test_database
db.users.find({}).pretty()
db.users.getIndexes()
db.runs.getIndexes()
```
Expect:
- `users.email` unique index
- `users.username_lower` unique index
- `runs` compound index on (score, depth)
- bcrypt hashes start with `$2b$`

## Step 2 — API curl tests (cookies are required to test /me)
```
API="$REACT_APP_BACKEND_URL"

# Register
curl -s -c /tmp/cookies.txt -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"hero@test.com","password":"dungeon123","username":"Testhero"}'

# /me
curl -s -b /tmp/cookies.txt "$API/api/auth/me"

# Logout
curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt -X POST "$API/api/auth/logout"

# Login
curl -s -c /tmp/cookies.txt -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"hero@test.com","password":"dungeon123"}'

# Submit run (guest — no cookies)
curl -s -X POST "$API/api/runs" -H 'Content-Type: application/json' \
  -d '{"seed":42,"character_class":"warrior","character_name":"Guest","depth":3,"score":120,"kills":5,"duration_seconds":180,"outcome":"dead","level":3}'

# Leaderboard
curl -s "$API/api/leaderboard?limit=10"
```

## Step 3 — Error cases
- Duplicate email → 400 "Email already registered"
- Duplicate username → 400 "Username taken"
- Wrong password 6x → 429 "Too many failed attempts..."
- Invalid email format → 422 (validation array)

## Step 4 — Frontend
- `/` loads Landing
- `/play` loads class selection
- `/game?cls=warrior&name=Testhero&seed=42` starts game
- `/leaderboard` lists top scores
