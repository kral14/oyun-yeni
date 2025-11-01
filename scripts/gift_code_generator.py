#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tower Defense Hədiyyə Kodu Generatoru
Bu proqram istədiyiniz pul, elmas və ulduz miqdarı üçün hədiyyə kodu yaradır.
"""

import tkinter as tk
from tkinter import ttk, messagebox
import json
import base64
import pyperclip


class GiftCodeGenerator:
    def __init__(self, root):
        self.root = root
        self.root.title("🎁 Tower Defense Hədiyyə Kodu Generatoru")
        self.root.geometry("500x400")
        self.root.resizable(False, False)
        
        # Dark theme colors
        bg_color = "#1a1a2e"
        fg_color = "#ffffff"
        input_bg = "#16213e"
        button_bg = "#4a90e2"
        
        self.root.configure(bg=bg_color)
        
        # Style
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TLabel', background=bg_color, foreground=fg_color, font=('Arial', 11))
        style.configure('TEntry', fieldbackground=input_bg, foreground=fg_color, font=('Arial', 11))
        style.configure('TButton', background=button_bg, foreground=fg_color, font=('Arial', 10, 'bold'))
        
        # Main frame
        main_frame = tk.Frame(root, bg=bg_color, padx=20, pady=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = tk.Label(main_frame, text="🎁 Hədiyyə Kodu Generatoru", 
                              font=('Arial', 16, 'bold'), bg=bg_color, fg="#00d4ff")
        title_label.pack(pady=(0, 20))
        
        # Money input
        money_frame = tk.Frame(main_frame, bg=bg_color)
        money_frame.pack(fill=tk.X, pady=10)
        tk.Label(money_frame, text="💰 Pul miqdarı:", bg=bg_color, fg=fg_color, 
                font=('Arial', 11), width=15, anchor='w').pack(side=tk.LEFT)
        self.money_entry = tk.Entry(money_frame, bg=input_bg, fg=fg_color, 
                                    font=('Arial', 11), width=20, insertbackground=fg_color)
        self.money_entry.pack(side=tk.LEFT, padx=10)
        self.money_entry.insert(0, "0")
        
        # Diamonds input
        diamonds_frame = tk.Frame(main_frame, bg=bg_color)
        diamonds_frame.pack(fill=tk.X, pady=10)
        tk.Label(diamonds_frame, text="💎 Elmas miqdarı:", bg=bg_color, fg=fg_color, 
                font=('Arial', 11), width=15, anchor='w').pack(side=tk.LEFT)
        self.diamonds_entry = tk.Entry(diamonds_frame, bg=input_bg, fg=fg_color, 
                                        font=('Arial', 11), width=20, insertbackground=fg_color)
        self.diamonds_entry.pack(side=tk.LEFT, padx=10)
        self.diamonds_entry.insert(0, "0")
        
        # Stars input
        stars_frame = tk.Frame(main_frame, bg=bg_color)
        stars_frame.pack(fill=tk.X, pady=10)
        tk.Label(stars_frame, text="⭐ Ulduz miqdarı:", bg=bg_color, fg=fg_color, 
                font=('Arial', 11), width=15, anchor='w').pack(side=tk.LEFT)
        self.stars_entry = tk.Entry(stars_frame, bg=input_bg, fg=fg_color, 
                                     font=('Arial', 11), width=20, insertbackground=fg_color)
        self.stars_entry.pack(side=tk.LEFT, padx=10)
        self.stars_entry.insert(0, "0")
        
        # Generate button
        generate_btn = tk.Button(main_frame, text="🎯 Kod Yaradın", 
                                 bg=button_bg, fg=fg_color, font=('Arial', 12, 'bold'),
                                 command=self.generate_code, 
                                 relief=tk.FLAT, padx=20, pady=10, cursor='hand2')
        generate_btn.pack(pady=20)
        
        # Code display
        code_label = tk.Label(main_frame, text="Yaradılan Kod:", 
                             bg=bg_color, fg=fg_color, font=('Arial', 11, 'bold'))
        code_label.pack(pady=(10, 5))
        
        # Text widget for code
        text_frame = tk.Frame(main_frame, bg=bg_color)
        text_frame.pack(fill=tk.BOTH, expand=True)
        
        self.code_text = tk.Text(text_frame, bg=input_bg, fg="#00ff00", 
                                 font=('Consolas', 10), height=5, wrap=tk.WORD,
                                 insertbackground=fg_color, relief=tk.FLAT, 
                                 borderwidth=1, highlightthickness=1,
                                 highlightbackground="#00d4ff", highlightcolor="#00d4ff")
        self.code_text.pack(fill=tk.BOTH, expand=True, padx=5)
        
        # Scrollbar
        scrollbar = tk.Scrollbar(text_frame, orient=tk.VERTICAL, command=self.code_text.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.code_text.config(yscrollcommand=scrollbar.set)
        
        # Copy button
        copy_btn = tk.Button(main_frame, text="📋 Kod Kopyalayın", 
                            bg="#357abd", fg=fg_color, font=('Arial', 10, 'bold'),
                            command=self.copy_code, 
                            relief=tk.FLAT, padx=15, pady=8, cursor='hand2')
        copy_btn.pack(pady=10)
        
        # Store generated code for clean copying
        self.generated_code = ""
        
        # Info label
        info_label = tk.Label(main_frame, 
                             text="💡 İstifadəçi oyunda 'Hədiyyə Kodu' bölməsində bu kodu daxil edə bilər",
                             bg=bg_color, fg="#888888", font=('Arial', 9),
                             wraplength=450)
        
        info_label.pack(pady=(10, 0))
        
    def generate_code(self):
        try:
            # Get values
            money = int(self.money_entry.get() or 0)
            diamonds = int(self.diamonds_entry.get() or 0)
            stars = int(self.stars_entry.get() or 0)
            
            # Validate
            if money < 0 or diamonds < 0 or stars < 0:
                messagebox.showerror("Xəta", "Mənfi dəyərlər daxil edilə bilməz!")
                return
            
            if money == 0 and diamonds == 0 and stars == 0:
                messagebox.showwarning("Xəbərdarlıq", "Ən azı bir hədiyyə miqdarı daxil edin!")
                return
            
            # Create data structure
            data = {
                "money": money,
                "diamonds": diamonds,
                "stars": stars
            }
            
            # Encode to JSON then base64 (without spaces for smaller code)
            json_str = json.dumps(data, separators=(',', ':'))
            encoded = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
            
            # Store the code for clean copying
            self.generated_code = encoded
            
            # Display code (ensure no extra characters)
            self.code_text.delete(1.0, tk.END)
            self.code_text.insert(1.0, encoded)
            
            # Verify what was inserted matches
            displayed_code = self.code_text.get(1.0, tk.END).strip()
            if displayed_code != encoded:
                print(f"⚠️ XƏBƏRDARLIQ: Text widget-dakı kod uyğun gəlmir!")
                print(f"   Orijinal: {encoded}")
                print(f"   Widget: {displayed_code}")
            
            # Print to console for verification
            print("\n" + "="*60)
            print("🎁 HƏDİYYƏ KODU YARADILDI")
            print("="*60)
            print(f"💰 Pul: {money}")
            print(f"💎 Elmas: {diamonds}")
            print(f"⭐ Ulduz: {stars}")
            print("-"*60)
            print(f"📋 Kod: {encoded}")
            print("="*60)
            
            messagebox.showinfo("Uğurlu!", 
                              f"✅ Hədiyyə kodu yaradıldı!\n\n"
                              f"💰 Pul: {money}\n"
                              f"💎 Elmas: {diamonds}\n"
                              f"⭐ Ulduz: {stars}\n\n"
                              f"Kodu kopyalamaq üçün 'Kod Kopyalayın' düyməsinə basın.")
            
        except ValueError:
            messagebox.showerror("Xəta", "Zəhmət olmasa yalnız rəqəm daxil edin!")
        except Exception as e:
            messagebox.showerror("Xəta", f"Xəta baş verdi: {e}")
    
    def copy_code(self):
        # Use stored code instead of reading from widget to avoid encoding issues
        if not self.generated_code:
            messagebox.showwarning("Xəbərdarlıq", "Əvvəlcə kod yaradın!")
            return
        
        try:
            pyperclip.copy(self.generated_code)
            messagebox.showinfo("Uğurlu!", "✅ Kod clipboard-a kopyalandı!")
            print(f"\n✅ Kod clipboard-a kopyalandı: {self.generated_code}")
        except Exception as e:
            messagebox.showerror("Xəta", f"Clipboard-a kopyalama mümkün olmadı: {e}")


def main():
    root = tk.Tk()
    app = GiftCodeGenerator(root)
    root.mainloop()


if __name__ == "__main__":
    main()


