import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-72px)] w-full flex items-center justify-center">
      <Card className="w-full max-w-md mx-4 border-primary/20">
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center space-y-4">
          <div className="p-4 bg-primary/10 rounded-2xl">
            <AlertCircle className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">404</h1>
          <p className="text-lg text-muted-foreground">
            La página que buscas no existe o ha sido movida.
          </p>
          <Button asChild className="fixgo-gradient font-bold text-white mt-4">
            <Link href="/">Volver al Inicio</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
