import { CopyPlus, Play, PlusCircle } from "lucide-react";

import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { AudioProfile } from "@/types/audio";

interface ProfilesViewProps {
  profiles: AudioProfile[];
  onActivate: (id: string) => void;
}

export function ProfilesView({ profiles, onActivate }: ProfilesViewProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Profiles"
        title="Scene presets"
        description="Keep reusable listening and routing setups close to the operator without introducing cloud sync or heavy state machinery."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {profiles.map((profile) => (
          <Card key={profile.id} className={profile.active ? "border-foreground/20" : undefined}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{profile.name}</CardTitle>
                  <CardDescription>{profile.description}</CardDescription>
                </div>
                <Badge variant={profile.active ? "default" : "outline"}>
                  {profile.active ? "Active" : profile.latencyMode}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Focus: {profile.focus}</p>
              <p className="text-sm text-muted-foreground">
                Activation is local UI state only until device routing persistence exists.
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button onClick={() => onActivate(profile.id)} variant={profile.active ? "secondary" : "default"} className="flex-1">
                <Play className="size-4" />
                Activate
              </Button>
              <Button variant="outline" className="flex-1">
                <CopyPlus className="size-4" />
                Duplicate
              </Button>
              <Button variant="ghost" className="flex-1">
                <PlusCircle className="size-4" />
                Create
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
