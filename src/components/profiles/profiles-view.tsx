import { Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { AudioProfile } from "@/types/audio";

interface ProfilesViewProps {
  profiles: AudioProfile[];
  onActivate: (id: string) => void;
}

export function ProfilesView({ profiles, onActivate }: ProfilesViewProps) {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Profiles</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Local scene presets. Activation applies latency mode preference.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {profiles.map((profile) => (
          <Card key={profile.id} className={profile.active ? "border-foreground/20 ring-1 ring-foreground/10" : undefined}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-semibold">{profile.name}</CardTitle>
                <Badge variant={profile.active ? "default" : "outline"} className="text-xs shrink-0">
                  {profile.active ? "Active" : profile.latencyMode}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <p className="text-sm text-muted-foreground">{profile.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">Focus: {profile.focus}</p>
            </CardContent>
            <CardFooter className="pt-0">
              <Button
                onClick={() => onActivate(profile.id)}
                variant={profile.active ? "secondary" : "default"}
                size="sm"
                className="w-full"
              >
                <Play className="size-3.5" />
                {profile.active ? "Active" : "Activate"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
